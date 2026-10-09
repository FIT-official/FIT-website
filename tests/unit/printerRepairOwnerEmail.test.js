// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { notifyRepairOwner, repairOwnerMessage, repairEmailSummary, REPAIR_OWNER_EMAIL } from '@/lib/printerRepair/ownerEmail'
import { repairFixture } from '../fixtures/printerRepair'
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(() => { throw Error('Real provider forbidden') }) }))
const env = { GMAIL_USER: 'synthetic@example.invalid', GMAIL_PASSWORD: 'not-a-credential' }
const accepted = () => ({ accepted: [REPAIR_OWNER_EMAIL] })
const get = (doc, key) => key.split('.').reduce((v, k) => v?.[k], doc)
function set(doc, key, value) { const keys=key.split('.'), last=keys.pop(); let target=doc; for(const k of keys) target=target[k] ||= {}; target[last]=value }
let doc, store
beforeEach(() => {
  doc = { requestId: repairFixture.clientRequestId, status: 'assessment_requested', brief: { ...repairFixture.brief, details: '<script>alert(1)</script> Synthetic remarks' }, photoAssetIds: [], notifications: { email: { status: 'pending', attempts: 0 } } }
  store = { findOne: vi.fn(async () => structuredClone(doc)), findOneAndUpdate: vi.fn(async (query, update) => {
    if (!Object.entries(query).every(([key, want]) => { const value=get(doc,key); return want?.$in ? want.$in.includes(value) : want?.$lt != null ? value < want.$lt : value === want })) return null
    for (const [key,value] of Object.entries(update.$set || {})) set(doc,key,value)
    for (const [key,value] of Object.entries(update.$inc || {})) set(doc,key,(get(doc,key) || 0)+value)
    return structuredClone(doc)
  }) }
})
const notify = options => notifyRepairOwner(store, doc.requestId, { env, ...options })
it('uses the existing owner only, escaped immutable details and preparation before payment; invents no fee or booking', () => {
  const message=repairOwnerMessage(doc)
  expect(message.to).toBe('fixittoday.contact@gmail.com')
  expect(message.text.startsWith('Customer: Demo Customer\nPhone: Not provided\nHandover / address:')).toBe(true)
  expect(message.text.indexOf('Customer remarks:')).toBeLessThan(message.text.indexOf('Payment / Stripe:'))
  expect(message.text).toContain('no payment taken'); expect(message.text).toContain('not a booked appointment')
  expect(message.html).not.toContain('<script>'); expect(message.html).toContain('&lt;script&gt;')
  expect(message.messageId).toBe(`<repair-${doc.requestId}@fixitoday.com>`)
})
it('collapses concurrent sends and accepted retries to one atomic durable claim', async () => {
  const send=vi.fn(async () => accepted())
  await Promise.all(Array.from({length:12},()=>notify({send})))
  expect(await notify({send,retry:true})).toBe('accepted'); expect(send).toHaveBeenCalledOnce()
  expect(doc.notifications.email.attempts).toBe(1)
  expect(store.findOneAndUpdate.mock.calls[0][2].writeConcern).toEqual({w:'majority',wtimeoutMS:10000})
})
it('saves definite failure and allows only an explicit successful retry', async () => {
  const send=vi.fn().mockRejectedValueOnce(Object.assign(Error('No'),{responseCode:451})).mockResolvedValue(accepted())
  expect(await notify({send})).toBe('failed'); expect(await notify({send})).toBe('failed'); expect(send).toHaveBeenCalledOnce()
  expect(await notify({send,retry:true})).toBe('accepted'); expect(send).toHaveBeenCalledTimes(2)
})
it('caps definite rejection at three attempts', async () => {
  const send=vi.fn().mockRejectedValue(Object.assign(Error('Auth'),{code:'EAUTH'}))
  for(let i=0;i<6;i++) await notify({send,retry:true})
  expect(send).toHaveBeenCalledTimes(3); expect(repairEmailSummary(doc).canRetry).toBe(false)
})
it.each([Error('Socket closed after DATA'),Object.assign(Error('Timeout'),{code:'ETIMEDOUT'})])('never retries ambiguous provider outcome %s', async error => {
  const send=vi.fn().mockRejectedValue(error)
  expect(await notify({send})).toBe('uncertain'); expect(await notify({send,retry:true})).toBe('uncertain'); expect(send).toHaveBeenCalledOnce()
})
it('times out safely and never resends after late provider acceptance', async () => {
  let finish; const send=vi.fn(()=>new Promise(resolve=>finish=resolve))
  expect(await notify({send,timeoutMs:5})).toBe('uncertain'); finish(accepted())
  expect(await notify({send,retry:true})).toBe('uncertain'); expect(send).toHaveBeenCalledOnce()
})
it.each([undefined,{}, {accepted:['wrong@example.invalid']}])('requires exact recipient acknowledgement %j', async info => {
  expect(await notify({send:async()=>info})).toBe('uncertain')
})
it('allows a retry after explicit recipient rejection', async () => {
  expect(await notify({send:async()=>({rejected:[REPAIR_OWNER_EMAIL]})})).toBe('failed')
  expect(repairEmailSummary(doc).canRetry).toBe(true)
})
it('persists unavailable configuration without consuming an attempt or public replay send', async () => {
  const send=vi.fn(async()=>accepted())
  expect(await notify({env:{},send})).toBe('not_configured'); expect(doc.notifications.email.attempts).toBe(0)
  expect(await notify({send})).toBe('not_configured'); expect(send).not.toHaveBeenCalled()
  expect(await notify({send,retry:true})).toBe('accepted')
})
it.each(['withdrawn','legacy'])('never backfills or alerts an ineligible request: %s', async kind => {
  if(kind==='withdrawn') doc.status='withdrawn'; else delete doc.notifications
  const send=vi.fn(); await notify({send,retry:true}); expect(send).not.toHaveBeenCalled(); expect(repairEmailSummary(doc).canRetry).toBe(false)
})
it('marks stale claims uncertain without reclaiming them', async () => {
  doc.notifications.email={status:'sending',attempts:1,startedAt:new Date(0)}
  const send=vi.fn(); expect(await notify({send,retry:true})).toBe('uncertain'); expect(send).not.toHaveBeenCalled()
})
it('does not send after losing the claim acknowledgement', async () => {
  const update=store.findOneAndUpdate.getMockImplementation()
  store.findOneAndUpdate.mockImplementationOnce(async(...args)=>{await update(...args);throw Error('Ack lost')})
  const send=vi.fn(); expect(await notify({send})).toBe('uncertain'); await notify({send,retry:true}); expect(send).not.toHaveBeenCalled()
})
it.each([true,false])('never duplicates an accepted send after final database failure, committed=%s', async committed => {
  const update=store.findOneAndUpdate.getMockImplementation();let calls=0
  store.findOneAndUpdate.mockImplementation(async(...args)=>{if(++calls===2){if(committed)await update(...args);throw Error('Write unavailable')}return update(...args)})
  const send=vi.fn(async()=>accepted());expect(await notify({send})).toBe('uncertain');await notify({send,retry:true});expect(send).toHaveBeenCalledOnce()
})
it('never calls SMTP if the claim cannot be persisted', async () => {
  store.findOneAndUpdate.mockRejectedValue(Error('Unavailable'));const send=vi.fn()
  expect(await notify({send})).toBe('uncertain');expect(send).not.toHaveBeenCalled()
})
