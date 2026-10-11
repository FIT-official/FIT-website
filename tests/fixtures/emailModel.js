import { zipSync, strToU8 } from 'fflate'
export const triangleStl = Buffer.from('solid synthetic\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 30 0 0\nvertex 0 20 3\nendloop\nendfacet\nendsolid synthetic')
export function binaryStl() {
  const bytes = Buffer.alloc(134); bytes.writeUInt32LE(1, 80)
  ;[0,0,0,30,0,0,0,20,3].forEach((v,i) => bytes.writeFloatLE(v,96+i*4))
  return bytes
}
export const mesh = '<mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="30" y="0" z="0"/><vertex x="0" y="20" z="3"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh>'
export function modelXml({ unit='millimeter', resources=`<object id="1">${mesh}</object>`, build='<item objectid="1"/>', prefix='' }={}) {
  return `${prefix}<model unit="${unit}" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${resources}</resources><build>${build}</build></model>`
}
export const archive = files => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name,text])=>[name,strToU8(text)]))))
export const simple3mf = options => archive({'3D/3dmodel.model':modelXml(options)})
// An original, synthetic key fob ring, constructed only from numeric geometry.
export function keychain3mf() {
  const vertices=[],triangles=[],n=48
  for(const z of[0,3])for(const radius of[8,12])for(let i=0;i<n;i++){const angle=i/n*Math.PI*2;vertices.push([Math.cos(angle)*radius,Math.sin(angle)*radius,z])}
  const quad=(a,b,c,d)=>{triangles.push([a,b,c],[a,c,d])}
  for(let i=0;i<n;i++){const j=(i+1)%n;quad(i,j,n+j,n+i);quad(2*n+i,3*n+i,3*n+j,2*n+j);quad(i,2*n+i,2*n+j,j);quad(n+i,n+j,3*n+j,3*n+i)}
  const shape=`<mesh><vertices>${vertices.map(([x,y,z])=>`<vertex x="${x}" y="${y}" z="${z}"/>`).join('')}</vertices><triangles>${triangles.map(([a,b,c])=>`<triangle v1="${a}" v2="${b}" v3="${c}"/>`).join('')}</triangles></mesh>`
  return simple3mf({resources:`<object id="1">${shape}</object>`})
}
