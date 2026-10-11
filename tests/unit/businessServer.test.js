// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { memoryDb } from '../fixtures/businessStore'
import { paidFixture, guidedFixture } from '../fixtures/ownerDigest'
const mocks = vi.hoisted(() => ({ connect: vi.fn(), email: vi.fn(), telegram: vi.fn() }))
vi.mock('@/lib/db', () => ({ connectToDatabase: mocks.connect }))
vi.mock('@/lib/email', () => ({ sendEmail: mocks.email }))
vi.mock('@/lib/business/telegram', () => ({ sendTelegramAlert: mocks.telegram }))
import { notificationConfiguration, stageEvent, sourceEvents, reconcileSources, prepareSummaries, captureChat, drainNotifications, notificationHealth, businessSender, retryKnownFailure } from '@/lib/business/server'
const started = '2026-10-10T00:00:00Z', now = new Date('2026-10-11T02:00:00Z')
const env = { FIT_BUSINESS_NOTIFICATIONS_ENABLED: 'true', FIT_BUSINESS_NOTIFICATIONS_START_AT: started }
const event = { kind: 'enquiry.submitted', source: 'print', reference: 'synthetic-1', key: 'synthetic-1', occurredAt: started, status: 'configured' }
let db
beforeEach(() => { db = memoryDb(); vi.clearAllMocks(); mocks.connect.mockResolvedValue({ connection: { db } }); for (const [k,v] of Object.entries(env)) vi.stubEnv(k,v); vi.stubEnv('STREAM_SUPPORT_USER_ID','owner'); vi.stubEnv('FIT_TELEGRAM_CHAT_ID','266599973'); vi.stubEnv('FIT_TELEGRAM_NOTIFICATIONS_ENABLED','false'); vi.stubEnv('FIT_TELEGRAM_BOT_TOKEN','') })
afterEach(() => vi.unstubAllEnvs())
it.each([{}, { FIT_BUSINESS_NOTIFICATIONS_ENABLED: 'true' }, { ...env, FIT_BUSINESS_NOTIFICATIONS_START_AT: 'bad' }, { ...env, FIT_BUSINESS_NOTIFICATIONS_ENABLED: 'false' }])('fails closed without activation (%j)', async config => {
  expect(notificationConfiguration(config).enabled).toBe(false)
  expect(await stageEvent(db,event,{env:config})).toEqual({status:'disabled'}); expect(db.stores.size).toBe(0)
})
it('does not alert or insert historical events',async()=>{expect((await stageEvent(db,{...event,occurredAt:'2026-10-09T23:59:59Z'},{env})).status).toBe('before_tracking_start');expect(db.stores.size).toBe(0)})
it('duplicates concurrent events only once and keeps the saved notification snapshot',async()=>{
  const sender=vi.fn(async()=>({status:'accepted',providerId:'synthetic-ack'}))
  await Promise.all(Array.from({length:10},()=>stageEvent(db,event,{env,now,sender})))
  expect(db.collection('businessEvents').rows).toHaveLength(1);expect(db.collection('businessNotifications').rows).toHaveLength(1);expect(sender).toHaveBeenCalledTimes(1)
})
it('queues again after an event was saved but queue insertion failed',async()=>{
  const queue=db.collection('businessNotifications'), update=queue.updateOne
  queue.updateOne=vi.fn().mockRejectedValueOnce(Error('synthetic storage outage')).mockImplementation(update)
  await expect(stageEvent(db,event,{env,dispatch:false})).rejects.toThrow()
  expect(db.collection('businessEvents').rows).toHaveLength(1)
  await stageEvent(db,event,{env,dispatch:false});expect(queue.rows).toHaveLength(1)
})
it('uses saved paid preparation details and never includes card metadata or mutable cart data',async()=>{
  const source=paidFixture();source.order.items=[{quantity:2},{quantity:1}]
  db=memoryDb({orders:[source.order],checkoutsessions:[source.checkout]})
  await sourceEvents(db,'order',source.order.stripeSessionId,{env,dispatch:false})
  const e=db.collection('businessEvents').rows[0],m=db.collection('businessNotifications').rows[0].message
  expect(e).toMatchObject({amountMinor:4020,currency:'SGD',itemCount:3})
  expect(m.text.startsWith('Customer: Synthetic Customer\nPhone: +65 80000000\nDelivery address:')).toBe(true)
  expect(m.text.indexOf('Keep both refills labelled')).toBeLessThan(m.text.indexOf('Payment / Stripe'))
  expect(m.text).toContain('cs_synthetic_paid');expect(m.text).not.toMatch(/4242|visa|2099|secret-private/)
  expect(JSON.stringify(e)).not.toMatch(/Synthetic Customer|80000000|shippingAddress|card|example.invalid/)
})
it('counts a paid order with an incomplete preparation snapshot but requires staff review',async()=>{
  const {order}=paidFixture();order.items=[{quantity:1}];db=memoryDb({orders:[order]})
  await sourceEvents(db,'order',order.stripeSessionId,{env,dispatch:false})
  expect(db.collection('businessEvents').rows[0].amountMinor).toBe(4020)
  expect(db.collection('businessNotifications').rows[0].message.text).toContain('Staff review is required')
})
it('does not count pending payments or unsubmitted print drafts',async()=>{
  db=memoryDb({orders:[{stripeSessionId:'pending'}],customprintrequests:[{requestId:'draft',createdAt:now}]})
  expect((await sourceEvents(db,'order','pending',{env})).status).toBe('not_paid')
  expect((await sourceEvents(db,'print','draft',{env})).status).toBe('draft')
  expect(db.collection('businessEvents').rows).toHaveLength(0)
})
it('counts shop-generated print fulfilment as order status, never another enquiry',async()=>{
  db=memoryDb({customprintrequests:[{requestId:'shop-print-job',source:'product',createdAt:now,printConfiguration:{isConfigured:true},statusHistory:[{status:'paid',updatedAt:now}]}]})
  await sourceEvents(db,'print','shop-print-job',{env,dispatch:false})
  expect(db.collection('businessEvents').rows).toHaveLength(1);expect(db.collection('businessEvents').rows[0]).toMatchObject({kind:'order.status',source:'print-job',status:'paid'})
  expect(db.collection('businessNotifications').rows).toHaveLength(0)
})
it('captures a configured print created before activation using the first configured time',async()=>{
  db=memoryDb({customprintrequests:[{requestId:'old-draft',createdAt:new Date('2026-10-01Z'),updatedAt:now,printConfiguration:{isConfigured:true},statusHistory:[{status:'configured',updatedAt:now}]}]})
  await sourceEvents(db,'print','old-draft',{env,dispatch:false});expect(db.collection('businessEvents').rows).toHaveLength(1)
  expect(db.collection('businessEvents').rows[0].occurredAt).toEqual(now)
})
it.each(['bulk','repair'])('preserves the existing %s owner email path without duplicate queueing',async source=>{
  const ref='synthetic-request',row={_id:ref,requestId:ref,createdAt:now,updatedAt:now,status:source==='bulk'?'new':'assessment_requested',notifications:{email:{status:'accepted'}}}
  if(source==='bulk')delete row.requestId
  db=memoryDb({[source==='bulk'?'bulkFilamentRequests':'printerrepairrequests']:[row]})
  await sourceEvents(db,source,ref,{env,dispatch:false})
  expect(db.collection('businessEvents').rows).toHaveLength(1);expect(db.collection('businessEvents').rows[0].emailObservation).toBe('accepted')
  expect(db.collection('businessNotifications').rows).toHaveLength(0)
})
it('recovers every committed enquiry transition, without counting note-only edits twice',async()=>{
  const history=[{status:'reviewing',timestamp:started},{status:'contacted',timestamp:now}]
  db=memoryDb({bulkFilamentRequests:[{_id:'bulk-id',createdAt:new Date('2026-10-01Z'),updatedAt:now,status:'contacted',businessStatusHistory:history}]})
  await sourceEvents(db,'bulk','bulk-id',{env,dispatch:false});await sourceEvents(db,'bulk','bulk-id',{env,dispatch:false})
  expect(db.collection('businessEvents').rows.map(r=>r.status)).toEqual(['reviewing','contacted']);expect(db.collection('businessNotifications').rows).toHaveLength(0)
})
it('recovers legacy order status changes without historical paid alerts',async()=>{
  db=memoryDb({users:[{_id:'user-db-id',userId:'user-id',businessActivityAt:now,orderHistory:[{_id:'line-1',statusHistory:[{status:'paid',timestamp:'2026-10-01Z'},{status:'shipped',timestamp:now}]}]}]})
  await reconcileSources(db,{env,now});await reconcileSources(db,{env,now})
  expect(db.collection('businessEvents').rows.map(r=>r.status)).toEqual(['shipped']);expect(db.collection('businessNotifications').rows).toHaveLength(0)
})
it('continues recovery through ties in updatedAt and flags a backlog',async()=>{
  const rows=Array.from({length:103},(_,i)=>({_id:String(i).padStart(4,'0'),createdAt:now,updatedAt:now,status:'new'}))
  db=memoryDb({bulkFilamentRequests:rows})
  const first=await reconcileSources(db,{env,now});expect(first.find(r=>r.source==='bulk')).toMatchObject({recovered:100,morePossible:true})
  const second=await reconcileSources(db,{env,now});expect(second.find(r=>r.source==='bulk')).toMatchObject({recovered:3,morePossible:false})
  expect(db.collection('businessEvents').rows).toHaveLength(103)
})
it('does not advance a failed source cursor or call delivery while recovering',async()=>{
  db=memoryDb({customprintrequests:[{...guidedFixture(),_id:'source-id',createdAt:now,updatedAt:now,guidedBrief:{quantity:0}}]})
  const result=await reconcileSources(db,{env,now});expect(result.some(r=>r.status==='capture_failed')).toBe(true)
  expect(await db.collection('businessReportState').findOne({_id:'cursor:print'})).toBeNull();expect(mocks.email).not.toHaveBeenCalled()
})
it('prepares only completed due periods after activation and catches up missed days in order',async()=>{
  const before=await prepareSummaries(db,{env,now:new Date('2026-10-10T23:59:59Z')});expect(before.every(r=>r.status==='not_due')).toBe(true)
  for(let i=0;i<3;i++)await prepareSummaries(db,{env,now:new Date('2026-10-13T02:00:00Z')})
  const keys=db.collection('businessReports').rows.map(r=>r._id)
  expect(keys).toEqual(expect.arrayContaining(['daily:2026-10-10','daily:2026-10-11','daily:2026-10-12','weekly:2026-10-05']))
  expect(keys.some(k=>k.startsWith('monthly:'))).toBe(false)
  await prepareSummaries(db,{env,now:new Date('2026-10-13T02:00:00Z')});expect(db.collection('businessReports').rows).toHaveLength(4)
  expect(db.collection('businessNotifications').rows).toHaveLength(4)
})
it('concurrent summary preparation cannot duplicate the same email',async()=>{
  await Promise.all(Array.from({length:8},()=>prepareSummaries(db,{env,now})))
  expect(db.collection('businessReports').rows).toHaveLength(1);expect(db.collection('businessNotifications').rows).toHaveLength(1)
})
it.each([{user:{id:'owner'}},{user:{id:'other',role:'admin'}},{user:{id:'customer'},silent:true}])('records chat activity but suppresses owner self/bot/silent alert %j',async properties=>{
  await captureChat({type:'message.new',message:{id:'message-id',created_at:started,text:'PRIVATE BODY',...properties}})
  expect(db.collection('businessEvents').rows).toHaveLength(1);expect(db.collection('businessNotifications').rows).toHaveLength(0)
  expect(JSON.stringify(db.collection('businessEvents').rows)).not.toContain('PRIVATE BODY')
})
it.each(['false','true'])('delivers incoming-chat email immediately with Telegram unavailable (flag %s)',async flag=>{
  mocks.email.mockResolvedValue({accepted:['fixittoday.contact@gmail.com'],messageId:'synthetic'})
  vi.stubEnv('GMAIL_USER','fixittoday.contact@gmail.com');vi.stubEnv('GMAIL_PASSWORD','synthetic-not-a-credential')
  vi.stubEnv('FIT_TELEGRAM_NOTIFICATIONS_ENABLED',flag)
  await captureChat({type:'message.new',message:{id:'message-id',created_at:started,text:'PRIVATE BODY',user:{id:'customer'}}})
  expect(db.collection('businessNotifications').rows.map(r=>r.channel)).toEqual(['email'])
  expect(db.collection('businessNotifications').rows[0].status).toBe('accepted')
  expect(JSON.stringify(db.collection('businessNotifications').rows)).not.toContain('PRIVATE BODY')
  expect(mocks.email).toHaveBeenCalledTimes(1);expect(mocks.telegram).not.toHaveBeenCalled()
})
it('delivers both chat channels only after explicit Telegram enablement and configuration',async()=>{
  vi.stubEnv('GMAIL_PASSWORD','');vi.stubEnv('FIT_TELEGRAM_NOTIFICATIONS_ENABLED','true');vi.stubEnv('FIT_TELEGRAM_BOT_TOKEN','synthetic-not-a-credential')
  mocks.telegram.mockResolvedValue({status:'accepted',providerId:'synthetic-telegram'})
  await captureChat({type:'message.new',message:{id:'message-id',created_at:started,user:{id:'customer'}}})
  expect(db.collection('businessNotifications').rows.map(r=>r.channel).sort()).toEqual(['email','telegram'])
  expect(mocks.telegram).toHaveBeenCalledTimes(1);expect(mocks.email).not.toHaveBeenCalled()
})
it('does not alert on chat message edits',async()=>{
  await captureChat({type:'message.updated',message:{id:'m1',created_at:started,user:{id:'customer'}}})
  expect(db.collection('businessEvents').rows[0].kind).toBe('chat.message.updated');expect(db.collection('businessNotifications').rows).toHaveLength(0)
})
it('dates distinct edits by their committed update time while deduplicating webhook retries',async()=>{
  const base={type:'message.updated',message:{id:'old-message',created_at:'2026-09-01T00:00:00Z',updated_at:started,user:{id:'customer'}}}
  await captureChat(base);await captureChat(base);await captureChat({...base,message:{...base.message,updated_at:'2026-10-11T00:00:00Z'}})
  expect(db.collection('businessEvents').rows.map(r=>r.occurredAt.toISOString())).toEqual(['2026-10-10T00:00:00.000Z','2026-10-11T00:00:00.000Z'])
  expect(db.collection('businessNotifications').rows).toHaveLength(0)
})
it('drains saved notifications and reports acceptance separately from read confirmation',async()=>{
  await stageEvent(db,event,{env,dispatch:false,now})
  const sender=vi.fn(async()=>({status:'accepted'}));await drainNotifications(db,{env,now,sender})
  await drainNotifications(db,{env,now,sender});expect(sender).toHaveBeenCalledTimes(1)
  expect(await notificationHealth(db)).toMatchObject({counts:{accepted:1},acceptedMeans:'Provider accepted, not inbox/read confirmation'})
})

it('keeps Telegram disabled even with configured credentials until explicitly enabled',async()=>{
  const config={...env,FIT_TELEGRAM_CHAT_ID:'266599973',FIT_TELEGRAM_BOT_TOKEN:'synthetic-not-a-credential'}
  expect(notificationConfiguration(config)).toMatchObject({enabled:true,telegramEnabled:false,telegramConfigured:true})
  const sender=vi.fn(async()=>({status:'accepted'}))
  await stageEvent(db,event,{env:config,now,sender,telegram:true})
  expect(sender).toHaveBeenCalledTimes(1);expect(sender.mock.calls[0][0]).toBe('email')
  expect(await businessSender(config)('telegram',{chatId:'266599973',text:'synthetic'})).toMatchObject({reason:'telegram_disabled'})
  expect(mocks.telegram).not.toHaveBeenCalled()
})
it.each(['false','true'])('preserves unavailable Telegram records and drains email without starvation (flag %s)',async flag=>{
  const enabled={...env,FIT_TELEGRAM_NOTIFICATIONS_ENABLED:'true',FIT_TELEGRAM_CHAT_ID:'266599973',FIT_TELEGRAM_BOT_TOKEN:'synthetic-not-a-credential'}
  for(let i=0;i<10;i++)await stageEvent(db,{...event,key:'telegram-'+i},{env:enabled,now,dispatch:false,email:false,telegram:true})
  const queue=db.collection('businessNotifications'),before=structuredClone(queue.rows)
  await stageEvent(db,event,{env,now,dispatch:false})
  const sender=vi.fn(async()=>({status:'accepted'}))
  expect(await drainNotifications(db,{env:{...env,FIT_TELEGRAM_NOTIFICATIONS_ENABLED:flag},now,sender})).toMatchObject({attempted:1})
  expect(sender.mock.calls.map(c=>c[0])).toEqual(['email'])
  expect(queue.rows.filter(r=>r.channel==='telegram')).toEqual(before)
  expect((await drainNotifications(db,{env:enabled,now,sender})).attempted).toBe(8)
})
it.each(['false','true'])('blocks manual Telegram retry while unavailable without changing attempts (flag %s)',async flag=>{
  const enabled={...env,FIT_TELEGRAM_NOTIFICATIONS_ENABLED:'true',FIT_TELEGRAM_CHAT_ID:'266599973',FIT_TELEGRAM_BOT_TOKEN:'synthetic-not-a-credential'}
  await stageEvent(db,event,{env:enabled,now,email:false,telegram:true,sender:async()=>({status:'failed',reason:'provider_rejected'})})
  const prior=structuredClone(db.collection('businessNotifications').rows[0]),sender=vi.fn()
  const config={...env,FIT_TELEGRAM_NOTIFICATIONS_ENABLED:flag}
  expect(await retryKnownFailure(db,prior._id,{env:config,now,sender})).toEqual({status:flag==='false'?'channel_disabled':'channel_unavailable'})
  expect(db.collection('businessNotifications').rows[0]).toEqual(prior);expect(sender).not.toHaveBeenCalled()
  expect((await notificationHealth(db,now,{env:config})).review[0].canRetry).toBe(false)
})

it('does not redirect queued Telegram messages to a changed destination',async()=>{
  expect(await businessSender({...env,FIT_TELEGRAM_NOTIFICATIONS_ENABLED:'true',FIT_TELEGRAM_BOT_TOKEN:'synthetic-not-a-credential',FIT_TELEGRAM_CHAT_ID:'1234'})('telegram',{chatId:'266599973',text:'synthetic'})).toMatchObject({status:'not_configured',reason:'telegram_destination_not_bound'})
  expect(mocks.telegram).not.toHaveBeenCalled()
})
it('allows a bounded manual retry for known failure but never uncertain or accepted delivery',async()=>{
  await stageEvent(db,event,{env,now,sender:async()=>({status:'not_configured',reason:'mailer_unavailable'})})
  const id=db.collection('businessNotifications').rows[0]._id,sender=vi.fn(async()=>({status:'accepted'}))
  expect((await notificationHealth(db,now)).review[0].canRetry).toBe(true)
  expect((await retryKnownFailure(db,id,{env,now,sender})).status).toBe('accepted')
  expect((await retryKnownFailure(db,id,{env,now,sender})).status).toBe('not_retryable');expect(sender).toHaveBeenCalledTimes(1)
  db.collection('businessNotifications').rows[0].status='uncertain'
  expect((await retryKnownFailure(db,id,{env,now,sender})).status).toBe('not_retryable')
  expect((await notificationHealth(db,now)).review[0].canRetry).toBe(false)
})
