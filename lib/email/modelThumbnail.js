import {createHash} from 'node:crypto'
import {inflateRawSync} from 'node:zlib'
import {XMLParser,XMLValidator} from 'fast-xml-parser'
import sharp from 'sharp'
import {validate3mfArchive,declared3mfUnit} from '@/lib/modelUnits'

export const THUMBNAIL_LIMITS=Object.freeze({inputBytes:4*1024*1024,expandedBytes:8*1024*1024,faces:30000,vertices:90000,instances:128,depth:16,width:480,height:320})
const fail=()=>{throw Error('Model preview unavailable within safe limits')}
const list=v=>v==null?[]:Array.isArray(v)?v:[v]
const number=v=>{const n=Number(v);if(v==null||v===''||!Number.isFinite(n)||Math.abs(n)>1e9)fail();return n}
const point=v=>[number(v[0]),number(v[1]),number(v[2])]
function boundedFace(faces,triangle){if(faces.length>=THUMBNAIL_LIMITS.faces)fail();faces.push(triangle.map(point))}
function stl(bytes){
  const out=[]
  if(bytes.length>=84&&84+bytes.readUInt32LE(80)*50===bytes.length){
    const count=bytes.readUInt32LE(80);if(!count||count>THUMBNAIL_LIMITS.faces)fail()
    for(let i=0;i<count;i++)boundedFace(out,Array.from({length:3},(_,v)=>Array.from({length:3},(_,axis)=>bytes.readFloatLE(84+i*50+12+v*12+axis*4))))
  }else{
    const text=bytes.toString('utf8');if(!/^\s*solid\b/i.test(text)||!/\bendsolid\b/i.test(text)||text.includes('\0'))fail()
    let vertices=[]
    for(const match of text.matchAll(/\bvertex\s+(\S+)\s+(\S+)\s+(\S+)/gi)){vertices.push(point(match.slice(1)));if(vertices.length===3){boundedFace(out,vertices);vertices=[]}}
    if(vertices.length||!out.length||(text.match(/\bfacet\s+normal\b/gi)||[]).length!==out.length||(text.match(/\bendfacet\b/gi)||[]).length!==out.length)fail()
  }
  return out
}
function obj(bytes){
  const vertices=[],faces=[]
  for(const line of bytes.toString('utf8').split(/\r?\n/)){
    const parts=line.trim().split(/\s+/)
    if(parts[0]==='v'){if(vertices.length>=THUMBNAIL_LIMITS.vertices)fail();vertices.push(point(parts.slice(1,4)))}
    if(parts[0]==='f'){
      if(parts.length<4||parts.length>65)fail()
      const points=parts.slice(1).map(part=>{const index=Number(part.split('/')[0]);if(!Number.isSafeInteger(index)||index===0)fail();const p=vertices[index<0?vertices.length+index:index-1];if(!p)fail();return p})
      for(let i=1;i<points.length-1;i++)boundedFace(faces,[points[0],points[i],points[i+1]])
    }
  }
  return faces
}
const identity=[1,0,0,0,1,0,0,0,1,0,0,0]
function transform(value){if(!value)return identity;const values=String(value).trim().split(/\s+/);if(values.length!==12)fail();return values.map(number)}
const apply=(p,m)=>[p[0]*m[0]+p[1]*m[3]+p[2]*m[6]+m[9],p[0]*m[1]+p[1]*m[4]+p[2]*m[7]+m[10],p[0]*m[2]+p[1]*m[5]+p[2]*m[8]+m[11]]
function threeMf(bytes){
  const archive=validate3mfArchive(bytes)
  if(archive.entries>256||archive.expandedBytes>THUMBNAIL_LIMITS.expandedBytes)fail()
  const documents=new Map(),parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',removeNSPrefix:true,parseTagValue:false,parseAttributeValue:false,processEntities:false})
  for(const file of archive.files){
    if(!/\.model$/i.test(file.name))continue
    if(file.uncompressed>4*1024*1024||file.uncompressed>Math.max(1024*1024,file.data.length*200))fail()
    const raw=file.method===8?inflateRawSync(file.data,{maxOutputLength:Math.max(1,file.uncompressed+1)}):Buffer.from(file.data)
    if(raw.length!==file.uncompressed)fail()
    const xml=raw.toString('utf8');if(/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(xml))fail()
    let depth=0,tags=0
    for(const tag of xml.matchAll(/<\/?[a-zA-Z_][^>]*>/g)){if(++tags>250000)fail();if(tag[0].startsWith('</'))depth--;else if(!tag[0].endsWith('/>'))depth++;if(depth>64||depth<0)fail()}
    if(depth||XMLValidator.validate(xml)!==true)fail()
    const model=parser.parse(xml).model;if(!model)fail()
    const objects=new Map()
    for(const o of list(model.resources?.object)){const id=String(o['@_id']);if(!/^\d+$/.test(id)||objects.has(id))fail();objects.set(id,o)}
    documents.set(file.name,{model,objects,unit:declared3mfUnit(xml)})
  }
  const built=[...documents].filter(([,d])=>list(d.model.build?.item).length)
  const root=documents.has('3D/3dmodel.model')?'3D/3dmodel.model':built.length===1?built[0][0]:null
  if(!root||!documents.get(root))fail()
  const unit=documents.get(root).unit,faces=[];let instances=0
  const resolve=(path,id,matrices=[],seen=new Set())=>{
    const key=path+':'+id;if(seen.has(key)||seen.size>=THUMBNAIL_LIMITS.depth||++instances>THUMBNAIL_LIMITS.instances)fail()
    const doc=documents.get(path),o=doc?.objects.get(String(id));if(!o||doc.unit!==unit)fail()
    const next=new Set(seen);next.add(key)
    if(o.mesh&&o.components)fail()
    if(o.mesh){
      const source=list(o.mesh.vertices?.vertex);if(source.length>THUMBNAIL_LIMITS.vertices)fail()
      const vertices=source.map(v=>point([v['@_x'],v['@_y'],v['@_z']]))
      for(const t of list(o.mesh.triangles?.triangle)){
        const triangle=['v1','v2','v3'].map(k=>{const id=Number(t['@_'+k]);if(!Number.isInteger(id)||id<0||!vertices[id])fail();return matrices.reduce((p,m)=>apply(p,m),vertices[id])})
        boundedFace(faces,triangle)
      }
    }
    for(const component of list(o.components?.component)){
      const reference=component['@_path'];let target=path
      if(reference){if(/[:\\\0]/.test(reference)||String(reference).split('/').includes('..'))fail();target=String(reference).replace(/^\//,'');if(!target.startsWith('3D/'))target=path.slice(0,path.lastIndexOf('/')+1)+target;if(!documents.has(target))fail()}
      resolve(target,component['@_objectid'],[transform(component['@_transform']),...matrices],next)
    }
  }
  for(const item of list(documents.get(root).model.build?.item)){
    // A cross-part build item needs a fuller production-extension parser;
    // do not silently render a different object from the root part.
    if(item['@_path'])fail()
    resolve(root,item['@_objectid'],[transform(item['@_transform'])])
  }
  return faces
}
export function thumbnailTriangles(bytes,filename){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>THUMBNAIL_LIMITS.inputBytes)fail()
  const extension=String(filename).split('.').pop().toLowerCase()
  const faces=extension==='stl'?stl(bytes):extension==='obj'?obj(bytes):extension==='3mf'?threeMf(bytes):fail()
  if(!faces.length)fail();return faces
}
export async function renderModelThumbnail(bytes,filename,{colour='#b8c5d0'}={}){
  const faces=thumbnailTriangles(bytes,filename),vertices=faces.flat(),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity]
  for(const p of vertices)for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],p[axis]);max[axis]=Math.max(max[axis],p[axis])}
  const centre=min.map((n,i)=>(n+max[i])/2),extent=Math.max(...min.map((n,i)=>max[i]-n));if(!Number.isFinite(extent)||extent<1e-9)fail()
  const project=p=>{const[x,y,z]=p.map((n,i)=>(n-centre[i])/extent);return[(x-y)*0.866,(x+y)*0.35-z*0.86,(x+y)*0.61+z*0.5]}
  const projected=faces.map(face=>face.map(project)),bounds=[Infinity,-Infinity,Infinity,-Infinity]
  for(const face of projected)for(const p of face){bounds[0]=Math.min(bounds[0],p[0]);bounds[1]=Math.max(bounds[1],p[0]);bounds[2]=Math.min(bounds[2],p[1]);bounds[3]=Math.max(bounds[3],p[1])}
  const scale=Math.min(400/(bounds[1]-bounds[0]||1),250/(bounds[3]-bounds[2]||1)),cx=(bounds[0]+bounds[1])/2,cy=(bounds[2]+bounds[3])/2
  const hex=/^#[0-9a-f]{6}$/i.test(colour)?colour:'#b8c5d0',rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))
  projected.sort((a,b)=>a.reduce((n,p)=>n+p[2],0)-b.reduce((n,p)=>n+p[2],0))
  // Bound vector work as well as input. This is an illustrative projection,
  // never quoting geometry or a printability/colour-accuracy promise.
  const polygons=projected.map(p=>{const ax=p[1][0]-p[0][0],ay=p[1][1]-p[0][1],az=p[1][2]-p[0][2],bx=p[2][0]-p[0][0],by=p[2][1]-p[0][1],bz=p[2][2]-p[0][2];const normal=[ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx],length=Math.hypot(...normal)||1,shade=0.67+0.28*Math.abs(normal[2]/length);const fill=rgb.map(n=>Math.round(n*shade+255*(1-shade)*0.12));return `<polygon points="${p.map(v=>`${((v[0]-cx)*scale+240).toFixed(2)},${((v[1]-cy)*scale+150).toFixed(2)}`).join(' ')}" fill="rgb(${fill.join(',')})" stroke="rgb(${fill.join(',')})" stroke-width="0.35"/>`}).join('')
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#eef1f4"/>${polygons}</svg>`
  const content=await sharp(Buffer.from(svg),{limitInputPixels:480*320}).png({compressionLevel:9}).toBuffer()
  if(content.length>256*1024)fail()
  const hash=createHash('sha256').update(content).digest('hex'),cid=`fit-model-${hash}@fixitoday.com`
  return{preview:{cid,width:480,height:320},attachment:{filename:'model-preview.png',content,contentType:'image/png',contentDisposition:'inline',cid}}
}
