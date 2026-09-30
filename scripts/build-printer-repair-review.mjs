// Offline review artifact: real repair UI with fixture-only authentication/API.
// This script never connects to MongoDB, S3, Clerk, email or production.
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'
const out = path.resolve('output/printer-repair-review')
fs.mkdirSync(out, { recursive: true })
const entry = `
import React, {useState, useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import PrinterRepairFlow from '@/components/Services/PrinterRepairFlow';
const records=new Map();
const changes=new Set();
let auth={isLoaded:true,isSignedIn:true,user:{id:'demo-review-user'}};
window.repairDemo={calls:[],scenario:'normal',lost:false,records,auth:()=>auth,subscribe:fn=>{changes.add(fn);return()=>changes.delete(fn)},signIn:()=>{auth={isLoaded:true,isSignedIn:true,user:{id:'demo-review-user'}};changes.forEach(fn=>fn())},signOut:()=>{auth={isLoaded:true,isSignedIn:false,user:null};changes.forEach(fn=>fn())}};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
window.fetch=async(url,options={})=>{
 const parsed=new URL(typeof url==='string'?url:url.url,'https://fit-preview.invalid');
 const demo=window.repairDemo;demo.calls.push({url:parsed.pathname,method:options.method||'GET',body:typeof options.body==='string'?options.body:null});
 if(parsed.pathname==='/api/printer-repair/config')return json({uploadsAvailable:demo.scenario!=='no-uploads'});
 if(!auth.isSignedIn)return json({error:'Sign in to send your assessment request.'},401);
 if(parsed.pathname==='/api/fabrication/assets'){
  if(demo.scenario==='upload-error')return json({error:'That image could not be decoded safely. Choose a JPEG, PNG or WebP photo.'},400);
  if(demo.scenario==='slow-upload')return new Promise((resolve,reject)=>{const timer=setTimeout(()=>resolve(json({assetId:crypto.randomUUID(),kind:'image'},201)),15000);options.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Stopped','AbortError'))},{once:true})});
  return json({assetId:crypto.randomUUID(),kind:'image'},201);
 }
 if(parsed.pathname==='/api/printer-repair'&&options.method==='POST'){
  if(demo.scenario==='rate-limit')return json({error:'Too many attempts. Please wait a minute before trying again.'},429);
  const payload=JSON.parse(options.body);let row=records.get(payload.clientRequestId);
  if(!row){row={requestId:crypto.randomUUID(),status:'assessment_requested',brief:payload.brief,photoCount:payload.photoAssetIds.length};records.set(payload.clientRequestId,row)}
  if(demo.scenario==='lost-response'&&!demo.lost){demo.lost=true;throw new TypeError('Fixture connection lost after saving')}
  return json({request:row},201);
 }
 const row=parsed.searchParams.has('clientRequestId')?records.get(parsed.searchParams.get('clientRequestId')):[...records.values()].find(item=>parsed.pathname.endsWith('/'+item.requestId));
 if(!row)return json({error:'Request not found.'},404);
 if(options.method==='PATCH'){row.status='withdrawn'}
 return json({request:row});
};
function Review(){const [key,setKey]=useState(0);const state=useSyncExternalStore(window.repairDemo.subscribe,window.repairDemo.auth);return <>
 <div className="reviewBanner"><strong>Local review · fixture data only</strong><span>No real requests, uploads, bookings or payments.</span></div>
 <header className="reviewHeader"><a href="#" onClick={event=>event.preventDefault()} className="reviewLogo">FIT<span>Fix It Today</span></a><span>Services / Printer repair</span></header>
 <div className="reviewTools"><label htmlFor="scenario">Test scenario </label><select id="scenario" defaultValue="normal" onChange={event=>{window.repairDemo.scenario=event.target.value;window.repairDemo.lost=false}}><option value="normal">Normal request</option><option value="lost-response">Lost response after saving</option><option value="rate-limit">Rate limit</option><option value="upload-error">Upload validation error</option><option value="slow-upload">Slow upload / stop</option><option value="no-uploads">Uploads unavailable after reset</option></select><button onClick={()=>{sessionStorage.clear();history.replaceState(null,'',location.pathname);window.repairDemo.calls.length=0;window.repairDemo.lost=false;records.clear();setKey(current=>current+1)}}>Reset demo</button><button onClick={()=>state.isSignedIn?window.repairDemo.signOut():window.repairDemo.signIn()}>{state.isSignedIn?'Preview signed out':'Preview signed in'}</button></div>
 <main><PrinterRepairFlow key={key}/></main><footer className="reviewFooter">Review build only. Production programmes, pricing and catalogue are unchanged.</footer>
 </>};
createRoot(document.getElementById('root')).render(<Review/>);
`
await build({ stdin: { contents: entry, loader: 'jsx', resolveDir: process.cwd() }, outfile: path.join(out, 'repair.js'), bundle: true, minify: true, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': process.cwd() }, loader: { '.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'fixture-clerk', setup(builder) {
  builder.onResolve({ filter: /^@clerk\/nextjs$/ }, args => ({ path: args.path, namespace: 'fixture' }))
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React,{cloneElement,useSyncExternalStore}from'react';export const useUser=()=>useSyncExternalStore(window.repairDemo.subscribe,window.repairDemo.auth);export function SignInButton({children}){return cloneElement(children,{onClick:()=>window.repairDemo.signIn()})}`, loader: 'jsx', resolveDir: process.cwd() }))
} }] })
const js = fs.readFileSync(path.join(out, 'repair.js'), 'utf8').replaceAll('</script', '<\\/script')
const css = fs.readFileSync(path.join(out, 'repair.css'), 'utf8')
const shell = `:root{--textColor:#111;--light:#67696b;--borderColor:#e6e6e6;--background:#fefefe}*{box-sizing:border-box}body{margin:0;background:#fefefe;color:#111;font-family:Arial,Helvetica,sans-serif}main,.reviewHeader,.reviewTools,.reviewFooter{width:85vw;max-width:1180px;margin:auto}.reviewBanner{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;padding:9px 16px;background:#fff3cf;color:#423512;font-size:11px;line-height:1.5}.reviewHeader{display:flex;justify-content:space-between;align-items:center;min-height:65px;border-bottom:1px solid #e6e6e6;font-size:12px;color:#67696b}.reviewLogo{color:#111;font-size:25px;font-weight:700;text-decoration:none;display:flex;align-items:center;gap:12px}.reviewLogo span{font-size:11px;font-weight:400}.reviewTools{display:flex;gap:9px;flex-wrap:wrap;align-items:center;padding-top:16px;font-size:11px;color:#585a5c}.reviewTools select,.reviewTools button{background:#fff;border:1px solid #b8b9bb;border-radius:6px;padding:8px;font-size:11px;color:#111;min-height:38px}.reviewTools :focus-visible{outline:2px solid #111;outline-offset:3px}.reviewFooter{padding:22px 0;border-top:1px solid #e6e6e6;font-size:11px;line-height:1.6;color:#67696b}@media(max-width:600px){main,.reviewHeader,.reviewTools,.reviewFooter{width:calc(100% - 32px)}.reviewHeader{min-height:56px}.reviewBanner{gap:2px;flex-direction:column;align-items:center}.reviewLogo span{display:none}.reviewTools select{max-width:210px}}`
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>FIT printer repair · offline review</title><style>${shell}\n${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`
fs.writeFileSync(path.join(out, 'FIT-printer-repair-review.html'), html)
fs.mkdirSync('output/playwright', { recursive: true })
fs.writeFileSync('output/playwright/render-repair-review.js', `async(page)=>{await page.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({status:200,contentType:'text/html',body:${JSON.stringify(html)}}):route.abort());await page.goto('https://fit-preview.invalid/printer-repair');await page.getByRole('heading',{name:'Need help with your 3D printer?'}).waitFor();return {loaded:true,fixtureOnly:true};}`)
console.log(JSON.stringify({ preview: path.join(out, 'FIT-printer-repair-review.html'), bytes: Buffer.byteLength(html), usesActualComponent: true, fixtureOnly: true }))
