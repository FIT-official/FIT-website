import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { storeCanvasImage, canvasImageQuery, canvasImageBody } from '@/lib/workshopCanvasImages'
import { validCanvasImage, canvasImageMatches, canvasImageId, canvasImageUrl, CANVAS_IMAGE_LIMITS } from '@/lib/workshopCanvasImageRef'
import { blankCanvas, validCanvas, shapeObject } from '@/lib/workshopCanvasModel'
import { readCanvas, writeCanvas, exportCanvas } from '@/lib/workshopCanvasStore'
import { newGuest, guestAccess } from '@/lib/workshopGuestIdentity'
import { memoryDb } from '../groupCanvas/memory.mjs'
const access = guestAccess(newGuest('g1', 'Synthetic artist').record), teacher = { role: 'teacher', userId: 'synthetic-teacher' }
const image = (width=160,height=100,background={r:240,g:60,b:30,alpha:.5}) => sharp({create:{width,height,channels:4,background}}).png().toBuffer()
const save = (version,document,action='draft',id=randomUUID()) => ({action,document,expectedVersion:version,expectedSeat:access.seat,requestId:id})
describe('safe immutable classroom image files', () => {
    it('accepts landscape/portrait/transparency, strips preview metadata and preserves original bytes', async () => {
        const store=memoryDb().collection('images')
        for(const [w,h] of [[160,100],[100,160]]) { const source=await image(w,h), ref=await storeCanvasImage(store,access,'g1','1',{source,mime:'image/png'}), row=await store.findOne({_id:canvasImageId(ref.key)}), meta=await sharp(Buffer.from(row.preview)).metadata();expect([ref.width,ref.height]).toEqual([w,h]);expect(meta.hasAlpha).toBe(true);expect(meta.exif).toBeUndefined();expect(Buffer.from(row.source)).toEqual(source);expect(validCanvasImage(ref)).toBe(true) }
    })
    it.each([5, 6, 7, 8])('auto-orients JPEG EXIF %s once with decoded preview dimensions and unchanged source', async orientation => {
        const source=await sharp({create:{width:120,height:80,channels:3,background:'#ff4400'}}).jpeg().withMetadata({orientation}).toBuffer(),store=memoryDb().collection('images')
        const ref=await storeCanvasImage(store,access,'g1','1',{source,mime:'image/jpeg'}),row=await store.findOne({_id:canvasImageId(ref.key)}),meta=await sharp(Buffer.from(row.preview)).metadata();expect([ref.width,ref.height]).toEqual([80,120]);expect([meta.width,meta.height]).toEqual([80,120]);expect(meta.format).toBe('png');expect(meta.orientation).toBeUndefined();expect(Buffer.from(row.source)).toEqual(source)
    })
    it('rejects corrupt, truncated, disguised, active, trailing and oversized images before any record changes', async () => {
        const store=memoryDb().collection('images'),source=await image(),original={_id:'original',studentWork:'kept'};await store.insertOne(original)
        const bad=[[Buffer.from('<svg onload="alert(1)"/>'),'image/png'],[Buffer.from('GIF89a'),'image/png'],[source.subarray(0,20),'image/png'],[Buffer.concat([source,Buffer.from('<script>no</script>')]),'image/png'],[source,'image/jpeg'],[Buffer.alloc(CANVAS_IMAGE_LIMITS.inputBytes+1),'image/png']]
        for(const [source,mime] of bad)await expect(storeCanvasImage(store,access,'g1','1',{source,mime})).rejects.toBeTruthy()
        const huge=await image(4097,4);await expect(storeCanvasImage(store,access,'g1','1',{source:huge,mime:'image/png'})).rejects.toBeTruthy();expect(await store.findOne({_id:'original'})).toEqual(original);expect((await store.find({}).toArray())).toHaveLength(1)
    })
    it('deduplicates identical concurrent uploads and refuses another group or a fake role', async () => {
        const store=memoryDb().collection('images'),source=await image(),refs=await Promise.all([1,2].map(()=>storeCanvasImage(store,access,'g1','1',{source,mime:'image/png'})));expect(refs[0]).toEqual(refs[1]);expect((await store.find({}).toArray())).toHaveLength(1)
        for(const actor of [{...access,group:'g2'},teacher,{}])await expect(storeCanvasImage(store,actor,'g1','1',{source,mime:'image/png'})).rejects.toMatchObject({status:403})
    })
    it('bounds streamed input and only accepts strict scoped image queries and MIME', async () => {
        for(const suffix of ['?homeGroup=g11&idea=1','?homeGroup=g1&idea=3','?homeGroup=g1&homeGroup=g2&idea=1','?homeGroup=g1&idea=1&url=https://evil.test','?homeGroup=g1&idea=1&id=abc'])expect(()=>canvasImageQuery(new Request('https://fit.test/'+suffix))).toThrow()
        expect(canvasImageQuery(new Request('https://fit.test/?homeGroup=g1&idea=1'),true)).toEqual({group:'g1',idea:'1'})
        await expect(canvasImageBody(new Request('https://fit.test',{method:'POST',headers:{'content-type':'image/svg+xml'},body:'x'}))).rejects.toMatchObject({status:415})
        await expect(canvasImageBody(new Request('https://fit.test',{method:'POST',headers:{'content-type':'image/png'},body:Buffer.alloc(CANVAS_IMAGE_LIMITS.inputBytes+1)}))).rejects.toMatchObject({status:413})
    })
})
describe('image-backed drawing revisions', () => {
    it('keeps raster refs small, scoped and URL-free; arbitrary image properties cannot enter SVG', () => {
        const ref={key:'g1-1-'+'a'.repeat(64),width:100,height:80};expect(validCanvas({...blankCanvas(),image:ref})).toBe(true);expect(canvasImageUrl(ref)).toContain('/api/workshop/guest/canvas-images?');expect(canvasImageMatches(ref,'g2','1')).toBe(false)
        for(const invalid of [{...ref,url:'https://evil.test'},{...ref,key:'javascript:evil'},{...ref,width:9999},{...ref,height:NaN}])expect(validCanvas({...blankCanvas(),image:invalid})).toBe(false)
    })
    it('saves/submits an image alone, retains exact earlier image/annotation snapshots, and deduplicates submit receipts', async () => {
        const store=memoryDb().collection('images'),ref=await storeCanvasImage(store,access,'g1','1',{source:await image(),mime:'image/png'}),doc={...blankCanvas(),image:ref}
        await writeCanvas(store,access,'g1','1',save(0,doc));const submit=save(1,doc,'submit');await writeCanvas(store,access,'g1','1',submit,{submissionsOpen:true});expect((await writeCanvas(store,access,'g1','1',submit,{submissionsOpen:true})).ackVersion).toBe(2)
        await writeCanvas(store,access,'g1','1',save(2,undefined,'fork'));const nextRef=await storeCanvasImage(store,access,'g1','1',{source:await image(80,160),mime:'image/png'}),next={...doc,image:nextRef,objects:[shapeObject('rect',[200,100],[400,300],{colour:'#234e48',fill:'none',size:5},randomUUID())]};await writeCanvas(store,access,'g1','1',save(3,next));expect((await readCanvas(store,access,'g1','1',2)).document).toEqual(doc);expect((await exportCanvas(store,teacher,'g1','1')).revisions).toHaveLength(4)
        await expect(writeCanvas(store,access,'g1','2',save(0,doc))).rejects.toMatchObject({status:403});await expect(writeCanvas(store,access,'g1','1',save(4,{...doc,image:{...ref,width:101}}))).rejects.toBeTruthy()
    })
})
const auth = vi.hoisted(()=>({guest:false,group:'g1',signedIn:false,teacher:false,store:null}))
vi.mock('@/lib/workshopGuestAccess',()=>({requireGuestAccess:async()=>{if(!auth.guest)throw Object.assign(Error('Sign in'),{status:401});return{role:'student',group:auth.group}},requireGuestTeacher:async()=>{if(!auth.signedIn)throw Object.assign(Error('Sign in'),{status:401});if(!auth.teacher)throw Object.assign(Error('Teacher required'),{status:403});return{role:'teacher',userId:'synthetic-teacher'}}}))
vi.mock('@/lib/workshopGuestHttp',()=>({guestDb:async()=>({collection:()=>auth.store}),classJson:(data,status=200)=>new Response(JSON.stringify(data),{status}),classFailure:error=>new Response(JSON.stringify({error:error.message}),{status:error.status||503}),sameOrigin:request=>{if(request.headers.get('origin')!==new URL(request.url).origin)throw Object.assign(Error('Origin'),{status:403})},limitGuestOperation:async()=>{}}))
import { GET,POST } from '@/app/api/workshop/guest/canvas-images/route'
beforeEach(()=>{vi.stubEnv('WORKSHOP_CANVAS_ENABLED','true');auth.guest=false;auth.signedIn=false;auth.teacher=false;auth.group='g1';auth.store={findOne:async()=>({preview:Buffer.from('synthetic safe PNG')})}})
afterEach(()=>vi.unstubAllEnvs())
describe('private raster responses',()=>{
    const req=()=>new Request('https://fit.test/api/workshop/guest/canvas-images?homeGroup=g1&idea=1&id='+'a'.repeat(64))
    it('denies missing/ordinary/foreign student access; allows same-group student or authoritative teacher with private headers',async()=>{expect((await GET(req())).status).toBe(401);auth.signedIn=true;expect((await GET(req())).status).toBe(403);auth.guest=true;auth.group='g2';expect((await GET(req())).status).toBe(403);auth.group='g1';let r=await GET(req());expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(r.headers.get('vary')).toBe('Cookie');expect(r.headers.get('x-content-type-options')).toBe('nosniff');auth.group='g2';auth.teacher=true;r=await GET(req());expect(r.status).toBe(200)})
    it('keeps uploads behind same-origin/student access and the existing feature switch',async()=>{expect((await POST(new Request('https://fit.test/api',{method:'POST'}))).status).toBe(403);vi.stubEnv('WORKSHOP_CANVAS_ENABLED','false');expect((await GET(req())).status).toBe(503)})
})
