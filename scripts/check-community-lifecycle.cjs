#!/usr/bin/env node
// Owned loopback Mongo only. Actual routes/store/admin checks; synthetic Clerk
// identity and rate edge. No provider credentials, orders or external sends.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),cp=require('node:child_process'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto')
const {build}=require('esbuild'),mongoose=require('mongoose')
const repo=path.resolve(__dirname,'..'),root=path.resolve(repo,'..'),mongod=process.argv[2]
assert(mongod&&path.isAbsolute(mongod)&&fs.existsSync(mongod),'Pass the existing local mongod executable')
assert(repo.startsWith('E:\\Codex-FIT-community-20261009\\')||process.env.FIT_ALLOW_OWNED_COMMUNITY_FIXTURE==='1','Run from the reviewed isolated workspace')
const run=path.join(root,'receipts','community-mongo-'+randomUUID()),data=path.join(run,'data')
fs.mkdirSync(data,{recursive:true})
const receipt={startedAt:new Date().toISOString(),scope:'actual community routes, store, Mongoose and local Mongo; synthetic auth/rate only',externalSends:0,productionWrites:0,checks:[]}
const state=globalThis.__fitCommunityFixture={user:'synthetic-member-a',admin:false,rateCalls:[],errors:[]}
const mark=name=>receipt.checks.push({name,passed:true})
let child,closed,owned=false,database,originalFetch=globalThis.fetch
async function main(){
 try{
  const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})})
  database='fit_community_fixture_'+randomUUID().replaceAll('-','')
  const uri=`mongodb://127.0.0.1:${port}/${database}`;receipt.database=database;receipt.port=port
  const log=fs.createWriteStream(path.join(run,'mongod.log'))
  child=cp.spawn(mongod,['--bind_ip','127.0.0.1','--port',String(port),'--dbpath',data,'--setParameter','diagnosticDataCollectionEnabled=false'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  closed=new Promise(resolve=>child.once('close',()=>{log.end();resolve()}))
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Owned Mongo startup timed out')),20000);child.once('error',e=>{clearTimeout(timer);reject(e)});child.once('exit',()=>{clearTimeout(timer);reject(Error('Owned Mongo exited during startup'))});let observed='';child.stdout.on('data',chunk=>{log.write(chunk);observed=(observed+chunk).slice(-12000);if(observed.includes('Waiting for connections')){clearTimeout(timer);resolve()}});child.stderr.on('data',chunk=>log.write(chunk))})
  await mongoose.connect(uri,{serverSelectionTimeoutMS:5000,autoIndex:false,maxPoolSize:4})
  assert.equal(mongoose.connection.name,database);assert.deepEqual(await mongoose.connection.db.listCollections().toArray(),[]);owned=true
  const bundle=path.join(repo,'output','community','mongo-api.cjs');fs.mkdirSync(path.dirname(bundle),{recursive:true})
  const edges={
   '@clerk/nextjs/server':`export const auth=async()=>({userId:globalThis.__fitCommunityFixture.user});export const clerkClient=async()=>({users:{getUser:async()=>({publicMetadata:{role:globalThis.__fitCommunityFixture.admin?'admin':'customer'}})}})`,
   '@/lib/db':`export const connectToDatabase=async()=>{if((await import('mongoose')).default.connection.readyState!==1)throw Error('Owned fixture disconnected')}`,
   '@/lib/community/rateLimit':`export const communityRate=async(request,kind,user)=>{globalThis.__fitCommunityFixture.rateCalls.push({kind,authenticated:!!user})}`,
  }
  await build({stdin:{contents:`export {GET as feed,POST as submit} from './app/api/community/route';export {GET as mine} from './app/api/community/mine/route';export {GET as detail,PATCH as edit} from './app/api/community/[entryId]/route';export {POST as comment} from './app/api/community/[entryId]/comments/route';export {POST as report} from './app/api/community/[entryId]/report/route';export {GET as queue,POST as moderate} from './app/api/admin/community/route';export {default as Entry} from './models/CommunityEntry';export {default as Report} from './models/CommunityReport';`,resolveDir:repo},outfile:bundle,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'owned-fixture-edges',setup(b){b.onResolve({filter:/^@\//},args=>{if(edges[args.path])return {path:args.path,namespace:'fixture'};const p=path.join(repo,args.path.slice(2));for(const ext of ['','.js','.jsx'])if(fs.existsSync(p+ext)&&fs.statSync(p+ext).isFile())return {path:p+ext};throw Error('Unresolved import '+args.path)});b.onResolve({filter:/^\.\/rateLimit$/},args=>args.importer.replaceAll('\\','/').endsWith('/lib/community/server.js')?{path:'@/lib/community/rateLimit',namespace:'fixture'}:null);b.onResolve({filter:/^@clerk\/nextjs\/server$/},args=>({path:args.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:edges[args.path],loader:'js',resolveDir:repo}))}}]})
  globalThis.fetch=async()=>{throw Error('External HTTP is disabled in this acceptance fixture')}
  const api=require(bundle),origin='https://fixture.invalid'
  const req=(body,method='GET',url='/api/community',from=origin)=>new Request(origin+url,{method,headers:{origin:from,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const ctx=id=>({params:Promise.resolve({entryId:id})})
  const call=async(handler,body,status=200,method='GET',url,id)=>{const r=await handler(req(body,method,url),id?ctx(id):undefined);const value=await r.json();assert.equal(r.status,status,JSON.stringify(value));return value}
  const post=()=>({clientRequestId:randomUUID(),kind:'project',topic:'coding',title:'A synthetic maker project',displayName:'Synthetic maker',body:'A small synthetic project used only for local community verification.',guidelinesAccepted:true,website:''})
  const comment=()=>({clientRequestId:randomUUID(),displayName:'Synthetic reply',body:'A useful synthetic reply for moderation verification.',guidelinesAccepted:true,website:''})
  const approve=async entry=>{state.admin=true;const r=await call(api.moderate,{action:'approve',entryId:entry.entryId,revision:entry.revision,note:''},200,'POST');state.admin=false;return r.entry}
  const draft=post(),replays=await Promise.all(Array.from({length:12},()=>api.submit(req(draft,'POST'))))
  receipt.concurrentResponses=await Promise.all(replays.map(async response=>({status:response.status,data:await response.clone().json()})))
  assert.equal(replays.filter(r=>r.status===201).length,1);assert.equal(replays.filter(r=>r.status===200).length,11);assert.equal(await api.Entry.countDocuments(),1)
  const first=(await replays[0].json()).entry;assert.equal(first.status,'pending');assert.equal((await call(api.feed)).items.length,0)
  mark('Twelve concurrent creates persist one pending entry with no automatic publication')
  const indexes=await api.Entry.collection.indexes(),reportIndexes=await api.Report.collection.indexes()
  assert(indexes.some(i=>i.unique&&i.key.ownerUserId===1&&i.key.clientRequestId===1));assert(reportIndexes.some(i=>i.unique&&i.key.entryId===1&&i.key.entryRevision===1&&i.key.reporterUserId===1))
  mark('Actual Mongo identity and report-deduplication unique indexes exist')
  await call(api.submit,{...draft,body:'A changed replay must not create another saved entry.'},409,'POST')
  await mongoose.disconnect();await mongoose.connect(uri,{autoIndex:false,serverSelectionTimeoutMS:5000,maxPoolSize:4})
  assert.equal((await call(api.mine)).items[0].entryId,first.entryId);await call(api.submit,draft,200,'POST')
  mark('Saved pending content and idempotent recovery survive disconnect/reconnect')
  state.user='synthetic-outsider';assert.equal((await call(api.mine)).items.length,0);await call(api.edit,{action:'withdraw',revision:1},404,'PATCH',undefined,first.entryId);await call(api.queue,undefined,403);await call(api.moderate,{action:'approve',entryId:first.entryId,revision:1},403,'POST')
  state.user=null;await call(api.submit,post(),401,'POST');await call(api.mine,undefined,401);state.user='synthetic-member-a'
  assert.equal((await api.submit(req(post(),'POST',undefined,'https://foreign.invalid'))).status,403)
  mark('Actual routes deny anonymous, cross-account, nonadmin and cross-origin operations')
  const published=await approve(first),detail=await call(api.detail,undefined,200,'GET',undefined,first.entryId)
  for(const hidden of ['ownerUserId','clientRequestId','submissionFingerprint','audit','moderationNote','synthetic-member-a','_id'])assert(!JSON.stringify(detail).includes(hidden))
  mark('Explicit admin approval publishes only a minimal public DTO without account identity')
  const pendingReply=(await call(api.comment,comment(),201,'POST',undefined,first.entryId)).entry
  assert.equal((await call(api.detail,undefined,200,'GET',undefined,first.entryId)).comments.length,0)
  await approve(pendingReply);assert.equal((await call(api.detail,undefined,200,'GET',undefined,first.entryId)).comments.length,1)
  await call(api.comment,comment(),404,'POST',undefined,pendingReply.entryId)
  mark('Comments have their own moderation gate and cannot create nested threads')
  const reportInput={revision:published.revision,reason:'privacy',details:'Synthetic moderator review only.'}
  await Promise.all(Array.from({length:10},()=>call(api.report,reportInput,200,'POST',undefined,first.entryId)))
  assert.equal(await api.Report.countDocuments(),1);state.admin=true
  const reports=await call(api.queue,undefined,200,'GET','/api/admin/community?view=reports');assert.equal(reports.items.length,1);assert.equal(reports.items[0].snapshot.body,first.body);assert(!JSON.stringify(reports).includes('reporterUserId'))
  mark('Ten concurrent reports deduplicate and preserve the exact reported public version')
  state.admin=false
  const editInput={action:'edit',revision:published.revision,displayName:'Synthetic maker',title:first.title,topic:first.topic,body:'The revised synthetic project must be reviewed again before publication.'}
  const revised=(await call(api.edit,editInput,200,'PATCH',undefined,first.entryId)).entry
  await call(api.detail,undefined,404,'GET',undefined,first.entryId);state.admin=true;await call(api.moderate,{action:'approve',entryId:first.entryId,revision:published.revision},409,'POST')
  const reportAfter=await call(api.queue,undefined,200,'GET','/api/admin/community?view=reports');assert.equal(reportAfter.items[0].snapshot.body,first.body);assert.equal(reportAfter.items[0].current.body,editInput.body)
  mark('Edits remove public visibility, invalidate stale approvals and preserve report snapshots')
  const republished=await approve(revised);state.admin=true
  await call(api.moderate,{action:'hide',entryId:first.entryId,revision:republished.revision,note:'Synthetic privacy review.'},200,'POST')
  await call(api.detail,undefined,404,'GET',undefined,first.entryId);assert.equal((await call(api.feed)).items.length,0)
  await call(api.report,{revision:2,reason:'privacy'},404,'POST',undefined,pendingReply.entryId)
  mark('Hiding a parent removes its approved comments from public access')
  await call(api.moderate,{action:'resolve_report',reportId:reports.items[0].reportId,note:'Reviewed and parent hidden.'},200,'POST');assert.equal((await call(api.queue,undefined,200,'GET','/api/admin/community?view=reports')).items.length,0)
  assert.equal((await call(api.queue,undefined,200,'GET','/api/admin/community?view=resolved-reports')).items.length,1)
  mark('Report resolution is explicit, durable and separate from content hiding')
  state.admin=false;const race=(await call(api.submit,post(),201,'POST')).entry;state.admin=true
  const outcomes=await Promise.all([api.moderate(req({action:'approve',entryId:race.entryId,revision:1},'POST')),api.edit(req({action:'withdraw',revision:1},'PATCH'),ctx(race.entryId))])
  assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);const raceSaved=await api.Entry.findOne({entryId:race.entryId}).lean();assert.equal(raceSaved.revision,2)
  if(raceSaved.status==='approved'){await call(api.edit,{action:'withdraw',revision:2},200,'PATCH',undefined,race.entryId)}
  await call(api.moderate,{action:'approve',entryId:race.entryId,revision:1},409,'POST')
  mark('Concurrent withdrawal and approval have one CAS winner; stale review cannot resurrect withdrawal')
  for(let i=0;i<23;i++){const row=(await call(api.submit,{...post(),title:`Synthetic pagination project ${i}`},201,'POST')).entry;await approve(row)}
  const a=await call(api.feed),b=await call(api.feed,undefined,200,'GET','/api/community?cursor='+encodeURIComponent(a.nextCursor));assert.equal(a.items.length,20);assert.equal(b.items.length,3);assert.equal(new Set([...a.items,...b.items].map(x=>x.entryId)).size,23)
  mark('Actual Mongo keyset pagination returns bounded pages without overlap')
  receipt.entryCount=await api.Entry.countDocuments();receipt.reportCount=await api.Report.countDocuments();receipt.rateEdgeCalls=state.rateCalls.length;receipt.status='passed'
 }catch(error){receipt.status='failed';receipt.error=error.stack||error.message;process.exitCode=1}
 finally{
  globalThis.fetch=originalFetch
  try{if(owned&&mongoose.connection.readyState===1){assert.equal(mongoose.connection.name,database);await mongoose.connection.dropDatabase();receipt.onlyOwnedDatabaseDropped=true}}catch(error){receipt.cleanupError=error.message;process.exitCode=1}
  await mongoose.disconnect().catch(()=>{});if(child?.pid&&child.exitCode==null)child.kill();if(closed)await closed
  receipt.ownedProcessStopped=!child||child.exitCode!=null||child.signalCode!=null;receipt.completedAt=new Date().toISOString()
  fs.writeFileSync(path.join(run,'receipt.json'),JSON.stringify(receipt,null,2));fs.writeFileSync(path.join(root,'receipts','community-mongo-latest.json'),JSON.stringify({...receipt,runDirectory:run},null,2));console.log(JSON.stringify({status:receipt.status,checks:receipt.checks.length,error:receipt.error,receipt:path.join(run,'receipt.json'),ownedProcessStopped:receipt.ownedProcessStopped}))
 }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1})
