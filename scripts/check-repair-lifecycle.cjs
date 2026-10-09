// Local acceptance only: node scripts/check-repair-lifecycle.cjs <existing mongod.exe>
// Starts one owned Mongo process on an ephemeral loopback port. No external transports.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const allowed=/^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH|PROCESSOR_ARCHITECTURE)$/i;
for(const key of Object.keys(process.env))if(!allowed.test(key))delete process.env[key];
Object.assign(process.env,{NODE_ENV:'test',TZ:'UTC',AWS_EC2_METADATA_DISABLED:'true',GMAIL_USER:'synthetic@example.test',GMAIL_PASSWORD:'synthetic-never-used',NEXT_PUBLIC_BASE_URL:'https://fixture.invalid'});
globalThis.fetch=async()=>{throw Error('External HTTP is disabled in the local repair lifecycle check')};
const mongoose=require('mongoose'),esbuild=require('esbuild');
async function main(){
 const repo=process.cwd(),binary=path.resolve(process.argv[2]||'');assert.equal(path.basename(binary).toLowerCase(),'mongod.exe');assert.ok(fs.statSync(binary).isFile());
 const run=randomUUID().replaceAll('-',''),root=path.resolve('..','receipts','repair-mongo-'+run),data=path.join(root,'data');fs.mkdirSync(data,{recursive:true});
 const socket=net.createServer();await new Promise((res,rej)=>{socket.once('error',rej);socket.listen(0,'127.0.0.1',res)});const port=socket.address().port;await new Promise(res=>socket.close(res));
 const database='fit_repair_readiness_'+run,uri=`mongodb://127.0.0.1:${port}/${database}?directConnection=true`;
 assert.match(uri,/^mongodb:\/\/127\.0\.0\.1:\d+\/fit_repair_readiness_[a-f0-9]+\?directConnection=true$/);
 const child=spawn(binary,['--bind_ip','127.0.0.1','--port',String(port),'--dbpath',data,'--wiredTigerCacheSizeGB','0.25'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 const closed=new Promise(res=>child.once('exit',res)),log=fs.createWriteStream(path.join(root,'mongod.log'));child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
 const receipt={startedAt:new Date().toISOString(),node:process.version,database,port,scope:'Actual repair routes, validation, Mongoose, owned MongoDB, unique indexes and durable alert claims; synthetic auth/rate/private-photo boundaries; captured email only',externalHttpEnabled:false,checks:[]};let owned=false;

 const state=globalThis.__fitRepairReadiness={actor:'synthetic-customer',admin:false,emails:[],mode:'accepted',photos:new Map()};
 const mark=name=>receipt.checks.push(name);
 try{
  await new Promise((res,rej)=>{const timeout=setTimeout(()=>rej(Error('Owned Mongo readiness timed out')),30000);let tail='';child.stdout.on('data',b=>{tail=(tail+b.toString()).slice(-12000);if(tail.includes('Waiting for connections')){clearTimeout(timeout);res()}});child.once('error',e=>{clearTimeout(timeout);rej(e)});child.once('exit',code=>{clearTimeout(timeout);rej(Error('Owned Mongo exited '+code))})});
  await mongoose.connect(uri,{serverSelectionTimeoutMS:5000,autoIndex:false,maxPoolSize:4});
  const opts=await mongoose.connection.db.admin().command({getCmdLineOpts:1});assert.equal(path.resolve(opts.parsed.storage.dbPath).toLowerCase(),data.toLowerCase());assert.equal(opts.parsed.net.port,port);assert.equal((await mongoose.connection.db.listCollections().toArray()).length,0);owned=true;

  const edge={
   '@clerk/nextjs/server':`export const auth=async()=>({userId:globalThis.__fitRepairReadiness.actor});`,
   '@/lib/db':`import mongoose from 'mongoose';export async function connectToDatabase(){if(mongoose.connection.readyState!==1||mongoose.connection.host!=='127.0.0.1')throw Error('Owned local Mongo required')}`,
   '@/lib/checkPrivileges':`export const checkAdminPrivileges=async()=>globalThis.__fitRepairReadiness.admin;`,
   '@/lib/fabrication/serverRateLimit':`export const enforceFabricationRate=async()=>{};`,
   '@/lib/fabrication/serverAssets':`import {fail} from '@/lib/fabrication/serverHttp';export async function findOwnedAsset(id,owner,kind){const asset=globalThis.__fitRepairReadiness.photos.get(id);if(!asset||asset.ownerUserId!==owner||asset.kind!==kind)fail('Attachment unavailable.',400);return asset};export const shapeFabricationAsset=async asset=>({assetId:asset.assetId,imageUrl:'https://private.example.invalid/synthetic',kind:'image'});export const privateFabricationBucket=async()=>{throw Error('No cloud storage allowed')};`,
   '@/lib/email':`export async function sendEmail(message){const s=globalThis.__fitRepairReadiness;if(message.to!=='fixittoday.contact@gmail.com')throw Error('Unexpected recipient');s.emails.push({...message,captured:true});if(s.mode==='rejected')throw Object.assign(Error('Synthetic preacceptance rejection'),{responseCode:451});if(s.mode==='uncertain')throw Error('Synthetic socket closed after DATA');return {accepted:[message.to]}}`,
  };
  const bundle=path.join(repo,'output','readiness','repair-lifecycle.cjs');fs.mkdirSync(path.dirname(bundle),{recursive:true});
  await esbuild.build({stdin:{contents:`export {POST as submit,GET as recover} from './app/api/printer-repair/route';export {GET as detail,PATCH as withdraw} from './app/api/printer-repair/[requestId]/route';export {GET as queue,POST as retry} from './app/api/admin/printer-repair/route';export {GET as triage} from './app/api/admin/printer-repair/[requestId]/route';export {GET as config} from './app/api/printer-repair/config/route';export {default as Model} from './models/PrinterRepairRequest';export {repairFixture as fixture} from './tests/fixtures/printerRepair';export {notifyRepairOwner} from './lib/printerRepair/ownerEmail';`,resolveDir:repo},outfile:bundle,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'local-only-edges',setup(build){build.onResolve({filter:/^@\//},args=>{if(edge[args.path])return {path:args.path,namespace:'synthetic'};const p=path.join(repo,args.path.slice(2));for(const suffix of ['', '.js','.jsx'])if(fs.existsSync(p+suffix)&&fs.statSync(p+suffix).isFile())return {path:p+suffix};throw Error('Unresolved local import '+args.path)});build.onResolve({filter:/^@clerk\/nextjs\/server$/},args=>({path:args.path,namespace:'synthetic'}));build.onLoad({filter:/.*/,namespace:'synthetic'},args=>({contents:edge[args.path],loader:'js',resolveDir:repo}));}}]});

  const api=require(bundle);
  const req=(body,method='POST',url='https://fixture.invalid/api/printer-repair',origin='https://fixture.invalid')=>new Request(url,{method,headers:{origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const call=async(handler,body,status,method='POST',url,context)=>{const response=await handler(req(body,method,url),context);const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data};
  const params=requestId=>({params:Promise.resolve({requestId})});
  const fixture=()=>({...structuredClone(api.fixture),clientRequestId:randomUUID()});
  const initial=fixture();
  const results=await Promise.all(Array.from({length:12},()=>api.submit(req(initial))));
  assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.status===200).length,11);
  const first=(await results[0].json()).request;assert.equal(await api.Model.countDocuments(),1);assert.equal(state.emails.length,1);
  const indexes=await api.Model.collection.indexes();assert.ok(indexes.some(i=>i.unique&&i.key.requestId===1));assert.ok(indexes.some(i=>i.unique&&i.key.customerUserId===1&&i.key.clientRequestId===1));
  mark('Twelve concurrent POSTs create one actual Mongo record, unique indexes and exactly one captured owner email');
  assert.equal((await api.Model.findOne({requestId:first.requestId}).lean()).notifications.email.status,'accepted');
  await call(api.submit,initial,200);await call(api.submit,{...initial,brief:{...initial.brief,details:'Different synthetic details'}},409);assert.equal(state.emails.length,1);
  assert.ok(!('notifications' in first));assert.ok(!('price' in first));assert.ok(!('appointment' in first));assert.ok(!('customerUserId' in first));
  mark('Exact retry reuses receipt and accepted alert; changed payload conflicts; customer receipt exposes no internal alert metadata or invented quote');
  await mongoose.disconnect();await mongoose.connect(uri,{serverSelectionTimeoutMS:5000,autoIndex:false,maxPoolSize:4});
  assert.equal((await call(api.recover,undefined,200,'GET','https://fixture.invalid/api/printer-repair?clientRequestId='+initial.clientRequestId)).request.requestId,first.requestId);
  mark('Assessment and alert survive Mongo disconnect/reconnect and recover by the original request identity');
  state.actor='synthetic-outsider';await call(api.detail,undefined,404,'GET',undefined,params(first.requestId));await call(api.withdraw,{action:'withdraw'},404,'PATCH',undefined,params(first.requestId));
  await call(api.recover,undefined,404,'GET','https://fixture.invalid/api/printer-repair?clientRequestId='+initial.clientRequestId);
  await call(api.queue,undefined,403,'GET');await call(api.retry,{action:'retry_owner_email',requestId:first.requestId},403);
  state.actor=null;await call(api.submit,fixture(),401);state.actor='synthetic-customer';
  assert.equal((await api.submit(req(fixture(),'POST',undefined,'https://foreign.invalid'))).status,403);
  mark('Actual routes deny anonymous writes, foreign origins, cross-account reads/withdrawals and nonadmin queue/retries');
  const badPhoto=fixture();badPhoto.photoAssetIds=[randomUUID()];await call(api.submit,badPhoto,400);
  const withPhoto=fixture(),photoId=randomUUID();state.photos.set(photoId,{assetId:photoId,ownerUserId:state.actor,kind:'image'});withPhoto.photoAssetIds=[photoId];
  const photoRequest=(await call(api.submit,withPhoto,201)).request;assert.equal(photoRequest.photoCount,1);state.admin=true;
  const triage=(await call(api.triage,undefined,200,'GET',undefined,params(photoRequest.requestId))).triage;assert.equal(triage.photos.length,1);assert.equal(triage.quoteDraft.price,null);assert.equal(triage.quoteDraft.appointment,null);
  assert.equal(triage.ownerEmail.status,'accepted');mark('Owned synthetic photo references persist, foreign references fail, and admin triage provides a private unpriced assessment');
  state.mode='rejected';const retryInput=fixture();const retryRequest=(await call(api.submit,retryInput,201)).request;const retryBody={action:'retry_owner_email',requestId:retryRequest.requestId};
  const before=state.emails.length;await call(api.submit,retryInput,200);assert.equal(state.emails.length,before);state.mode='accepted';
  const retryResults=await Promise.all(Array.from({length:8},()=>api.retry(req(retryBody))));assert.ok(retryResults.every(r=>r.status===200));
  assert.equal(state.emails.length,before+1);assert.equal((await api.Model.findOne({requestId:retryRequest.requestId}).lean()).notifications.email.attempts,2);
  mark('Definite provider failure preserves enquiry; public replay never resends; concurrent admin retries produce one new captured attempt');
  state.mode='uncertain';const uncertain=(await call(api.submit,fixture(),201)).request;state.mode='accepted';const unknownCount=state.emails.length;
  const blocked=await call(api.retry,{action:'retry_owner_email',requestId:uncertain.requestId},200);assert.equal(blocked.ownerEmail.status,'uncertain');assert.equal(blocked.ownerEmail.canRetry,false);assert.equal(state.emails.length,unknownCount);
  mark('Ambiguous SMTP outcome remains durably quarantined with no duplicate send on admin retry');
  state.mode='rejected';const withdrawn=(await call(api.submit,fixture(),201)).request;state.mode='accepted';
  assert.equal((await call(api.withdraw,{action:'withdraw'},200,'PATCH',undefined,params(withdrawn.requestId))).request.status,'withdrawn');
  const withdrawCount=state.emails.length;assert.equal((await call(api.retry,{action:'retry_owner_email',requestId:withdrawn.requestId},200)).ownerEmail.canRetry,false);assert.equal(state.emails.length,withdrawCount);
  assert.equal((await call(api.triage,undefined,200,'GET',undefined,params(withdrawn.requestId))).triage.quoteDraft.status,'closed');
  mark('Withdrawal closes assessment and prevents pending/failed owner alert retries');
  const queue=await call(api.queue,undefined,200,'GET');assert.ok(queue.requests.every(r=>r.status==='assessment_requested'));assert.ok(!JSON.stringify(queue).includes('submissionFingerprint'));assert.ok(!JSON.stringify(queue).includes('synthetic-customer'));
  const config=await call(api.config,undefined,200,'GET');assert.equal(config.uploadsAvailable,false);assert.equal(config.requestsAvailable,true);
  mark('Admin queue hides internal identifiers and optional photos fail closed without private cloud storage');
  await call(api.retry,{...retryBody,to:'customer@example.invalid'},400);assert.equal((await api.retry(req(retryBody,'POST',undefined,'https://foreign.invalid'))).status,403);
  mark('Retry API rejects recipient injection and cross-origin actions; destination remains the existing FIT owner');
  receipt.persistedRequestCount=await api.Model.countDocuments();receipt.emailCaptureCount=state.emails.length;receipt.actualEmailDelivery=false;receipt.status='passed';
 }catch(error){receipt.status='failed';receipt.error=error.stack||error.message;process.exitCode=1}
 finally{
  try{if(owned&&mongoose.connection.readyState===1){assert.equal(mongoose.connection.name,database);await mongoose.connection.dropDatabase();receipt.onlyOwnedSyntheticDatabaseDropped=true}}catch(e){receipt.cleanupError=e.message;process.exitCode=1}
  await mongoose.disconnect().catch(()=>{});if(child.pid&&child.exitCode==null)child.kill();await closed;log.end();receipt.ownedProcessStopped=child.exitCode!=null||child.signalCode!=null;receipt.completedAt=new Date().toISOString();fs.writeFileSync(path.join(root,'receipt.json'),JSON.stringify(receipt,null,2));fs.writeFileSync(path.resolve('..','receipts','repair-mongo-lifecycle-latest.json'),JSON.stringify({...receipt,runDirectory:root},null,2));console.log(JSON.stringify({status:receipt.status,checks:receipt.checks.length,error:receipt.error,receipt:path.join(root,'receipt.json'),ownedProcessStopped:receipt.ownedProcessStopped}));
 }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1});
