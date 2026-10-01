// A self-contained review of the actual UI. Every API is replaced with
// in-memory fixtures before rendering; no live account can be affected.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
const destination = resolve('output/community-review')
await mkdir(destination, { recursive: true })
const entry = `
import React,{useState,useSyncExternalStore}from'react';
import{createRoot}from'react-dom/client';
import CommunityThread from '@/components/Community/CommunityThread';
import CommunityModerationPanel from '@/components/Community/CommunityModerationPanel';
import{classifyContent,validateEntry,validateModeration}from'@/lib/community/policy';
const listeners=new Set();let actor={isLoaded:true,isSignedIn:true,user:{id:'demo-customer'}};
window.communityDemo={snapshot:()=>actor,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},choose:id=>{actor={isLoaded:true,isSignedIn:!!id,user:id?{id}:null};listeners.forEach(fn=>fn())}};
const initial={entryId:'56e1fe9c-33e5-4ae3-8e70-dbc6b0c97b34',kind:'shop_review',subject:'demo-shop',displayName:'A customer',body:'The finish was disappointing. I would have liked clearer updates.',rating:1,completedRequestLinked:true,replyTo:null,createdAt:'2026-10-01T00:00:00.000Z',visibility:'visible',flags:['negative_feedback'],abuseConfirmed:false,revision:0,audit:[],postingState:{revision:0,postingSuspended:false,restrictedUntil:null}};
let entries=[initial];const attempts=new Map();
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
window.fetch=async(url,options={})=>{
 const parsed=new URL(url,'https://fixture.invalid');const id=actor.user?.id;
 if(parsed.pathname.startsWith('/api/admin/community')){
  if(id!=='demo-fit-admin')return json({error:'Only FIT platform admins can moderate.'},403);
  if(options.method==='PATCH'){
   const body=JSON.parse(options.body),row=entries.find(item=>parsed.pathname.includes(item.entryId));if(!row)return json({error:'Post not found.'},404);
   if(parsed.pathname.endsWith('/posting'))return json({error:'Posting restrictions are not performed in this UI review. Use the fixture test suite.'},409);
   const checked=validateModeration(body);if(checked.error)return json({error:checked.error},400);
   if(body.expectedRevision!==row.revision)return json({error:'Refresh the changed post before retrying.'},409);
   if(body.action==='hide')row.visibility='hidden';if(body.action==='restore')row.visibility='visible';if(body.action==='confirm_abuse')row.abuseConfirmed=true;if(body.action==='clear_abuse')row.abuseConfirmed=false;if(body.action==='mark_reviewed')row.flags=[];
   row.revision++;row.audit.push({...body,at:new Date().toISOString()});return json({updated:true});
  }
  const view=parsed.searchParams.get('view');return json({entries:entries.filter(row=>view==='hidden'?row.visibility==='hidden':view==='flagged'?row.flags.length:true).map(row=>({...row,reports:[],confirmedAbuseCount:row.abuseConfirmed?1:0})),nextCursor:null});
 }
 if(parsed.pathname==='/api/community/eligibility')return json({eligible:id==='demo-customer'&&!entries.some(row=>row.clientActor===id&&row.kind==='shop_review')?[{orderType:'print_request',orderId:'demo-completed-request'}]:[]});
 if(parsed.pathname.endsWith('/report')){
  if(!id)return json({error:'Sign in to report a concern.'},401);
  const row=entries.find(item=>parsed.pathname.includes(item.entryId));if(row){row.flags=[...new Set([...row.flags,'reported'])];row.revision++}return json({reported:true});
 }
 if(parsed.pathname==='/api/community'&&options.method==='POST'){
  if(!id)return json({error:'Sign in to post.'},401);
  const body=JSON.parse(options.body),checked=validateEntry(body);if(checked.error)return json({error:checked.error},400);
  if(body.kind==='shop_review'&&(id==='demo-shop'||body.orderId!=='demo-completed-request'))return json({error:'A completed customer request is required.'},403);
  if(body.kind==='shop_reply'&&id!=='demo-shop')return json({error:'Only this shop can respond.'},403);
  const key=id+':'+body.clientRequestId;if(attempts.has(key))return json({entry:attempts.get(key),replayed:true});
  const row={entryId:crypto.randomUUID(),clientActor:id,kind:body.kind,subject:body.subject,displayName:body.displayName,body:body.body,rating:body.rating||null,replyTo:body.parentId||null,completedRequestLinked:body.kind==='shop_review',createdAt:new Date().toISOString(),visibility:'visible',flags:classifyContent(body.body,body.rating),abuseConfirmed:false,revision:0,audit:[],postingState:{revision:0,postingSuspended:false,restrictedUntil:null}};
  entries.push(row);attempts.set(key,row);return json({entry:row},201);
 }
 if(parsed.pathname==='/api/community'){
  const kind=parsed.searchParams.get('kind'),subject=parsed.searchParams.get('subject'),rows=entries.filter(row=>row.kind===kind&&row.subject===subject&&row.visibility==='visible');
  return json({entries:rows,replies:entries.filter(row=>row.kind==='shop_reply'&&row.subject===subject&&row.visibility==='visible'),rating:kind==='shop_review'?{count:rows.length,average:rows.length?rows.reduce((sum,row)=>sum+row.rating,0)/rows.length:null}:null,nextCursor:null});
 }
 throw new Error('This offline review has no network access.');
};
function Review(){const[view,setView]=useState('shop');const[reset,setReset]=useState(0);return<>
 <header className='banner'><strong>FIT community review</strong><span>Offline fixtures. No live posts, accounts or punishments.</span></header>
 <nav className='tools'><label>View<select value={view} onChange={event=>{setView(event.target.value);if(event.target.value==='admin')window.communityDemo.choose('demo-fit-admin')}}><option value='shop'>Hosted service shop</option><option value='blog'>Article comments</option><option value='admin'>FIT moderation</option></select></label><label>Account<select defaultValue='demo-customer' onChange={event=>window.communityDemo.choose(event.target.value)}><option value='demo-customer'>Customer with a completed request</option><option value='demo-shop'>Service shop owner</option><option value='demo-fit-admin'>FIT platform admin</option><option value=''>Signed out</option></select></label><button onClick={()=>{entries=[{...initial,flags:['negative_feedback'],audit:[]}];attempts.clear();sessionStorage.clear();setReset(value=>value+1)}}>Reset fixtures</button></nav>
 <main key={reset}>{view==='admin'?<CommunityModerationPanel/>:<CommunityThread key={view} kind={view==='shop'?'shop_review':'blog_comment'} subject={view==='shop'?'demo-shop':'first-print'}/>}</main>
 </>};createRoot(document.getElementById('root')).render(<Review/>);
`
const result = await build({ stdin: { contents: entry, loader: 'jsx', resolveDir: process.cwd() }, bundle: true, write: false, outfile: resolve(destination, 'community.js'), minify: true, jsx: 'automatic', format: 'iife', platform: 'browser', alias: { '@': process.cwd() }, loader: { '.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'fixture-auth', setup(builder) {
  builder.onResolve({ filter: /^@clerk\/nextjs$/ }, args => ({ path: args.path, namespace: 'fixture' }))
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React,{cloneElement,useSyncExternalStore}from'react';export const useUser=()=>useSyncExternalStore(window.communityDemo.subscribe,window.communityDemo.snapshot);export const SignInButton=({children})=>cloneElement(children,{onClick:()=>window.communityDemo.choose('demo-customer')});`, loader: 'jsx', resolveDir: process.cwd() }))
} }] })
const js = result.outputFiles.find(file => file.path.endsWith('.js')).text.replaceAll('</script', '<\\/script')
const css = result.outputFiles.find(file => file.path.endsWith('.css')).text
const shell = `*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#fff;color:#171717}.banner{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;padding:12px;background:#fff3cf;font-size:12px}.tools,main{width:calc(100% - 32px);max-width:980px;margin:auto}.tools{display:flex;gap:16px;flex-wrap:wrap;padding-top:24px;font-size:12px}.tools label{display:grid;gap:6px}.tools select,.tools button{min-height:44px;padding:10px;border:1px solid #aaa;border-radius:4px;background:white;color:#171717}.tools :focus-visible{outline:2px solid #171717;outline-offset:3px}`
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>FIT community review</title><style>${shell}\n${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`
await writeFile(resolve(destination, 'FIT-community-review.html'), html)
console.log(JSON.stringify({ artifact: resolve(destination, 'FIT-community-review.html'), bytes: Buffer.byteLength(html), usesActualComponents: true, fixtureOnly: true }))
