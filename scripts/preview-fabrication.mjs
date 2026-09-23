// Local development preview. Authentication/storage are simulated only in this process.
import { createServer } from 'vite'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs/promises'
import sharp from 'sharp'
import { build } from 'esbuild'
import tailwindcss from '@tailwindcss/postcss'
import crypto from 'node:crypto'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'output/playwright/fabrication')
await fs.mkdir(out, { recursive: true })
const bundled = path.join(out, 'domain.mjs')
await build({ stdin: { contents: "export * from './lib/fabrication/catalog.js'; export * from './lib/fabrication/validate.js'; export * from './lib/fabrication/pricing.js'", resolveDir: root }, outfile: bundled, bundle: true, platform: 'node', format: 'esm' })
const { createFabricationOffer, calculateFabricationEstimate, validateFabricationCatalog } = await import(pathToFileURL(bundled).href)
const imagePath = path.join(out, 'name-tag.png')
const tagBytes = await sharp(path.join(root, 'scripts/preview/name-tag.svg')).png().toBuffer()
await fs.writeFile(imagePath, tagBytes)
const offers = ['name_tag','laser_cut','engraving','dot_peen','sls','metal_print'].map(kind => {
  const offer = createFabricationOffer(kind)
  offer.id = kind === 'name_tag' ? 'name-tag' : kind.replaceAll('_','-')
  offer.name = {name_tag:'Brass name tags',laser_cut:'Laser-cut acrylic',engraving:'Personalised engraving',dot_peen:'Dot peen marking',sls:'SLS nylon parts',metal_print:'Metal print consultation'}[kind]
  offer.enabled = true
  offer.materials[0].id = 'material-1'
  offer.materials[0].name = kind === 'name_tag' ? 'Brass' : kind === 'sls' ? 'PA12 nylon' : kind === 'metal_print' ? 'Stainless steel' : 'Acrylic'
  if (kind === 'name_tag') {
    offer.materials[0].thicknessMm = 1.5
    offer.materials[0].pricePerCm2 = .12
    offer.template = {assetId:'template-tag',region:{x:.28,y:.34,width:.5,height:.3},fontFamily:'sans',textColor:'#273f3e'}
    offer.optionGroups = [{id:'finish',name:'Finish',required:true,choices:[{id:'brushed',label:'Brushed',priceDelta:0},{id:'polished',label:'Polished',priceDelta:2}]}]
  }
  return offer
})
const bespoke = createFabricationOffer('custom')
Object.assign(bespoke,{id:'cnc-work',name:'CNC machining',enabled:true,description:'Custom machining for prototypes and small batches. Send a drawing for review.'})
offers.push(bespoke)
let catalog = { enabled: true, offers }
const assets = new Map([['template-tag',{ assetId:'template-tag', kind:'image', imageUrl:'/api/preview-assets/template-tag', width:1000,height:500,originalName:'Brass tag.png',bytes:tagBytes }]])
let requests = []
const assetShape = asset => { if (!asset) return undefined; const {bytes: _bytes, ...rest} = asset; return rest }
const withImages = () => ({...catalog,offers:catalog.offers.map(offer=>({...offer,...(offer.template?{template:{...offer.template,...assetShape(assets.get(offer.template.assetId))}}:{})}))})
const json = (res,status,data) => {res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data))}
const readBody = async req => {const chunks=[];for await(const chunk of req)chunks.push(chunk);return Buffer.concat(chunks)}
const saved = () => fs.writeFile(path.join(out,'saved-requests.json'),JSON.stringify(requests,null,2))
const mock=path.join(root,'scripts/preview/flow-mocks.jsx')
const server=await createServer({ configFile:false,root:path.join(root,'scripts/preview'),esbuild:{jsx:'automatic'},
  resolve:{alias:[{find:'@clerk/nextjs',replacement:mock},{find:'next/navigation',replacement:mock},{find:'next/link',replacement:path.join(root,'scripts/preview/flow-link.js')},{find:'@/utils/UserSubscriptionContext',replacement:path.join(root,'scripts/preview/fabrication-subscription.js')},{find:'@',replacement:root}]},
  css:{postcss:{plugins:[tailwindcss()]}},server:{host:'127.0.0.1',port:4320,strictPort:true,fs:{allow:[root]}},
  plugins:[{name:'fabrication-preview',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
    if(!req.url.startsWith('/api/'))return next()
    try{
      if(req.url==='/api/stripe/plans')return json(res,200,{plans:[]})
      if(req.url.startsWith('/api/preview-assets/')){const asset=assets.get(req.url.split('/').at(-1));if(!asset)return json(res,404,{});res.writeHead(200,{'content-type':asset.kind==='image'?'image/png':'application/octet-stream'});return res.end(asset.bytes)}
      if(req.url.includes('/creators/')){const selected=new URL(req.url,'http://localhost').searchParams.get('offerId'),publicCatalog=withImages();if(selected)publicCatalog.offers=publicCatalog.offers.filter(offer=>offer.id===selected);return json(res,200,{...publicCatalog,creator:{id:'studio',userId:'studio',name:'Form & Foundry'}})}
      if(req.url.startsWith('/api/user/fabrication-service')){
        if(req.method==='PUT'){const {catalog:batch,removedOfferIds=[]}=JSON.parse(await readBody(req));const value=validateFabricationCatalog({...batch,enabled:false});if(!value.ok)return json(res,400,value);catalog={enabled:batch.enabled,offers:[...catalog.offers.filter(offer=>!removedOfferIds.includes(offer.id)&&!batch.offers.some(entry=>entry.id===offer.id)),...value.value.offers]}}
        return json(res,200,{catalog:withImages(),planId:'pro',canManage:true})
      }
      if(req.url==='/api/fabrication/assets'){
        const bytes=await readBody(req)
        const request=new Request('http://localhost/upload',{method:'POST',headers:{'content-type':req.headers['content-type']},body:bytes})
        const file=(await request.formData()).get('file')
        const assetId=crypto.randomUUID(), original=Buffer.from(await file.arrayBuffer())
        const isImage=['image/png','image/jpeg','image/webp'].includes(file.type)
        const png=isImage?await sharp(original).rotate().png().toBuffer():original
        const metadata=isImage?await sharp(png).metadata():{}
        const asset={assetId,kind:isImage?'image':'reference',originalName:file.name,bytes:png,...(isImage?{imageUrl:`/api/preview-assets/${assetId}`,width:metadata.width,height:metadata.height}:{fileUrl:`/api/preview-assets/${assetId}`})}
        assets.set(assetId,asset);return json(res,200,assetShape(asset))
      }
      if(req.url==='/api/fabrication/estimate'||(req.url==='/api/fabrication/requests'&&req.method==='POST')){
        const {creatorId:_creator,clientRequestId,imageAssetId,referenceAssetId,...input}=JSON.parse(await readBody(req))
        const result=calculateFabricationEstimate(catalog,input)
        if(!result.ok)return json(res,400,{error:result.error,issues:result.issues})
        if(req.url.endsWith('/estimate'))return json(res,200,{estimate:result.value})
        let request=requests.find(job=>job.clientRequestId===clientRequestId)
        if(!request){const now=new Date().toISOString();request={requestId:crypto.randomUUID(),clientRequestId,status:'submitted',creatorUserId:'studio',customerUserId:'preview-user',snapshot:result.value,personalization:result.value.personalization,image:assetShape(assets.get(imageAssetId)),reference:assetShape(assets.get(referenceAssetId)),createdAt:now,updatedAt:now};requests.unshift(request);await saved()}
        return json(res,200,{request})
      }
      if(req.url.startsWith('/api/fabrication/requests?'))return json(res,200,{requests})
      if(req.url.startsWith('/api/fabrication/requests/')&&req.method==='PATCH'){
        const request=requests.find(job=>job.requestId===req.url.split('/').at(-1)),{expectedUpdatedAt,...changes}=JSON.parse(await readBody(req))
        if(!request)return json(res,404,{error:'Not found'})
        if(request.updatedAt!==expectedUpdatedAt)return json(res,409,{error:'Refresh this request before saving.'})
        Object.assign(request,changes,{updatedAt:new Date().toISOString()});await saved();return json(res,200,{request})
      }
      return json(res,404,{error:'Not simulated in this preview.'})
    }catch(error){return json(res,500,{error:error.message})}
  })}}],
})
await server.listen()
console.log('Fabrication preview: http://127.0.0.1:4320/fabrication.html?creator=studio&offer=name-tag')
console.log('Original image fixture: '+imagePath)
