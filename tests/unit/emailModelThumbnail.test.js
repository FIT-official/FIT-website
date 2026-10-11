// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import sharp from 'sharp'
import { thumbnailTriangles, renderModelThumbnail, THUMBNAIL_LIMITS } from '@/lib/email/modelThumbnail'
import { ownedModelKey, thumbnailForRequest, preparePrintEmail } from '@/lib/email/printMessage'
import { triangleStl, binaryStl, mesh, simple3mf, modelXml, archive, keychain3mf } from '../fixtures/emailModel'
describe('bounded generated email previews', () => {
  it('parses both STL encodings and ignores OBJ material URLs', () => {
    expect(thumbnailTriangles(triangleStl,'a.stl')).toEqual(thumbnailTriangles(binaryStl(),'a.STL'))
    const obj=Buffer.from('mtllib https://attacker.invalid/file\nv 0 0 0\nv 30 0 0\nv 0 20 3\nf -3 -2 -1')
    expect(thumbnailTriangles(obj,'a.obj')).toEqual(thumbnailTriangles(triangleStl,'a.stl'))
  })
  it.each(['micron','millimeter','centimeter','inch','foot','meter'])('handles declared %s units as a shape preview without claiming dimensions', unit => {
    expect(thumbnailTriangles(simple3mf({unit}),'a.3mf')).toHaveLength(1)
  })
  it('composes build and assembly transforms', () => {
    const bytes=simple3mf({resources:`<object id="1">${mesh}</object><object id="2"><components><component objectid="1" transform="1 0 0 0 1 0 0 0 1 10 0 0"/></components></object>`,build:'<item objectid="2" transform="1 0 0 0 1 0 0 0 1 0 20 0"/>'})
    expect(thumbnailTriangles(bytes,'a.3mf')[0][0]).toEqual([10,20,0])
  })
  it('resolves archive-local multipart components', () => {
    const root=modelXml({resources:'<object id="2"><components><component objectid="1" path="/3D/part.model"/></components></object>',build:'<item objectid="2"/>'})
    expect(thumbnailTriangles(archive({'3D/3dmodel.model':root,'3D/part.model':modelXml({build:''})}),'a.3mf')).toHaveLength(1)
  })
  it('rejects mixed units across assembly parts', () => {
    const root=modelXml({resources:'<object id="2"><components><component objectid="1" path="/3D/part.model"/></components></object>',build:'<item objectid="2"/>'})
    expect(()=>thumbnailTriangles(archive({'3D/3dmodel.model':root,'3D/part.model':modelXml({unit:'inch',build:''})}),'a.3mf')).toThrow()
  })
  it.each(['https://attacker.invalid/part.model','../part.model','\\server\\part.model'])('rejects external or unsafe component %s', path => {
    expect(()=>thumbnailTriangles(simple3mf({resources:`<object id="1"><components><component objectid="1" path="${path}"/></components></object>`}),'a.3mf')).toThrow()
  })
  it('rejects cycles, invalid triangles, unsupported units and XML entities', () => {
    for(const opts of[
      {resources:'<object id="1"><components><component objectid="1"/></components></object>'},
      {resources:`<object id="1">${mesh.replace('v3="2"','v3="99"')}</object>`},
      {unit:'yard'}, {prefix:'<!DOCTYPE model [<!ENTITY x SYSTEM "https://attacker.invalid">]>'},
      {resources:'<object id="1"><![CDATA[malformed]]></object>'},
    ])expect(()=>thumbnailTriangles(simple3mf(opts),'a.3mf')).toThrow()
  })
  it('enforces compressed expansion, archive traversal, instance and input bounds', () => {
    expect(()=>thumbnailTriangles(archive({'../3D/3dmodel.model':modelXml()}),'a.3mf')).toThrow()
    expect(()=>thumbnailTriangles(simple3mf({prefix:' '.repeat(2*1024*1024)}),'a.3mf')).toThrow()
    expect(()=>thumbnailTriangles(simple3mf({build:'<item objectid="1"/>'.repeat(129)}),'a.3mf')).toThrow()
    expect(()=>thumbnailTriangles(Buffer.alloc(THUMBNAIL_LIMITS.inputBytes+1),'a.stl')).toThrow()
  })
  it('rejects malformed, unsupported and nonfinite geometry', () => {
    const nan=binaryStl();nan.writeFloatLE(NaN,96)
    for(const [bytes,name] of[[nan,'a.stl'],[Buffer.from('garbage'),'a.stl'],[triangleStl,'a.step'],[Buffer.from('v 1 2 3\nf 1 2 3'),'a.obj'],[Buffer.from('not a zip'),'a.3mf']])expect(()=>thumbnailTriangles(bytes,name)).toThrow()
  })
  it('renders numeric geometry to bounded inline PNG without source metadata or links', async () => {
    const result=await renderModelThumbnail(keychain3mf(),'private-customer-name.3mf',{colour:'url(https://attacker.invalid)'})
    expect(result.preview.cid).toMatch(/^fit-model-[a-f0-9]{64}@fixitoday\.com$/)
    const metadata=await sharp(result.attachment.content).metadata()
    expect(metadata).toMatchObject({format:'png',width:480,height:320})
    expect(metadata.exif).toBeUndefined()
    expect(result.attachment.content.length).toBeLessThan(256*1024)
    expect(result.attachment.filename).toBe('model-preview.png')
    expect(result.attachment.content.toString()).not.toContain('private-customer')
  })
})
const request={userId:'user_1',modelFile:{originalName:'model.stl',s3Key:'models/user_1/a.stl'}}
describe('preview source ownership and fallback',()=>{
  it('accepts only the saved owner prefix and supported type',()=>{
    expect(ownedModelKey(request)).toBe('models/user_1/a.stl')
    for(const key of['models/user_2/a.stl','models/user_1/../x','https://x','models/user_1/a\0'])expect(ownedModelKey({...request,modelFile:{...request.modelFile,s3Key:key}})).toBeNull()
    expect(ownedModelKey({...request,source:'product'})).toBeNull()
    expect(ownedModelKey({...request,modelFile:{...request.modelFile,originalName:'part.step'}})).toBeNull()
  })
  it('never fetches an arbitrary model URL or a failed ownership check',async()=>{
    const read=vi.fn()
    expect(await thumbnailForRequest({...request,modelFile:{originalName:'model.stl',s3Url:'https://attacker.invalid'}},{read})).toBeNull()
    expect(read).not.toHaveBeenCalled()
  })
  it('falls back on missing, large, rejected or unreadable geometry',async()=>{
    for(const read of[async()=>null,async()=>Buffer.alloc(4*1024*1024+1),async()=>{throw Error('storage')}])expect(await thumbnailForRequest(request,{read})).toBeNull()
    const builder=()=>({subject:'S',html:'<p>Details</p>',text:'Details'})
    expect(await preparePrintEmail(builder,{request},{thumbnail:async()=>{throw Error('bad')}})).toEqual(builder())
    const thumbnail=vi.fn();expect(await preparePrintEmail(()=>null,{request},{thumbnail})).toBeNull();expect(thumbnail).not.toHaveBeenCalled()
  })
  it('attaches the generated CID and preserves text through preparation',async()=>{
    const image=await renderModelThumbnail(triangleStl,'a.stl')
    const built=await preparePrintEmail(({preview})=>({subject:'S',text:'Details',html:preview?.cid||'fallback'}),{request},{thumbnail:async()=>image})
    expect(built.html).toBe(image.preview.cid);expect(built.attachments[0].contentType).toBe('image/png');expect(built.text).toBe('Details')
  })
})
