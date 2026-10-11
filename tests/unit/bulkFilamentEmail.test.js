// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { parseBulkInput, saveBulkRequest } from '@/lib/bulkFilament'
import { bulkOwnerMessage, bulkEmailStatus, notifyBulkOwner, BULK_OWNER_EMAIL } from '@/lib/bulkFilamentEmail'
import { fixtureCatalogue, fixtureInput, fixtureLine } from '../fixtures/bulkFilament'
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(() => { throw Error('Real provider forbidden in tests') }) }))
const env = { GMAIL_USER: 'synthetic@example.invalid', GMAIL_PASSWORD: 'synthetic-not-a-credential' }
const accepted = () => ({ accepted: [BULK_OWNER_EMAIL] })
const get = (doc, key) => key.split('.').reduce((value, part) => value?.[part], doc)
function set(doc, key, value) { const keys = key.split('.'), last = keys.pop(); let target = doc; for (const part of keys) target = target[part] ||= {}; target[last] = value }
function memory() {
  const docs = new Map()
  return { docs, findOne: vi.fn(async q => structuredClone(docs.get(q._id) || null)), insertOne: vi.fn(async doc => {
    if (docs.has(doc._id)) throw Object.assign(Error('duplicate'), { code: 11000 })
    docs.set(doc._id, structuredClone(doc))
  }), findOneAndUpdate: vi.fn(async (q, update) => {
    const doc = docs.get(q._id)
    if (!doc || !Object.entries(q).every(([key, expected]) => {
      const value = get(doc, key)
      return expected?.$in ? expected.$in.includes(value) : expected?.$lt != null ? value < expected.$lt : value === expected
    })) return null
    for (const [key, value] of Object.entries(update.$set || {})) set(doc, key, value)
    for (const [key, value] of Object.entries(update.$inc || {})) set(doc, key, (get(doc,key) || 0) + value)
    return structuredClone(doc)
  }) }
}
let store, input, catalogue, original
beforeEach(async () => {
  catalogue = fixtureCatalogue(); original = structuredClone(catalogue)
  const body = fixtureInput(catalogue); body.customer.phone = '+65 8000 0000'
  body.lines = [fixtureLine(catalogue, 'Lanbo', 'PLA', 'Black', 4), fixtureLine(catalogue, 'Lanbo', 'PLA', 'White', 6)]
  body.lines[0] = { ...body.lines[0], price: 0.01, lineCents: 1, remarks: '<img src=x onerror=alert(1)> separate bag' }
  body.lines[1].remarks = 'Keep labelled'
  input = parseBulkInput(body); store = memory(); await saveBulkRequest(store, input, async () => catalogue)
})
const notify = options => notifyBulkOwner(store, input.clientRequestId, { env, ...options })
it('sends exact canonical preparation details before payment information, with no invented totals', async () => {
  const send = vi.fn(async () => accepted()); expect(await notify({ send })).toBe('accepted')
  const message = send.mock.calls[0][0]
  expect(message.to).toBe(BULK_OWNER_EMAIL); expect(message).not.toHaveProperty('cc'); expect(message).not.toHaveProperty('bcc')
  expect(message.text.startsWith('ITEMS TO PREPARE / CHECK')).toBe(true)
  expect(message.text.indexOf('Quantity: 6 rolls')).toBeLessThan(message.text.indexOf('CUSTOMER CONTACT'))
  expect(message.text).toContain('Customer: Synthetic QA\nPhone: +65 8000 0000')
  expect(message.text).toContain('Quantity: 4 rolls'); expect(message.text).toContain('Quantity: 6 rolls')
  expect(message.text).toContain('Item remarks: Keep labelled')
  expect(message.text).toContain('Indicative filament total: SGD 139.00')
  expect(message.text).toContain('Indicative line total: SGD 55.60'); expect(message.text).toContain('Indicative line total: SGD 83.40')
  expect(message.text.indexOf('Item remarks: Keep labelled')).toBeLessThan(message.text.indexOf('Payment / Stripe:'))
  expect(message.text).toContain('no payment taken; no Stripe transaction'); expect(message.text).toContain('No stock reserved')
  expect(message.html).not.toContain('<img'); expect(message.html).toContain('&lt;img')
  expect(message.text).not.toContain('0.01'); expect(catalogue).toEqual(original)
  expect(store.docs.get(input.clientRequestId).notifications.email).toMatchObject({ status: 'accepted', attempts: 1, recipient: BULK_OWNER_EMAIL })
})
it('collapses twelve simultaneous attempts and subsequent replay to one provider send', async () => {
  const send = vi.fn(async () => accepted())
  await Promise.all(Array.from({ length: 12 }, () => notify({ send })))
  await saveBulkRequest(store,input,async () => { throw Error('Must not reprice') }); expect(await notify({ send, retry: true })).toBe('accepted')
  expect(send).toHaveBeenCalledOnce(); expect(store.docs.size).toBe(1)
  expect(store.findOneAndUpdate.mock.calls[0][2].writeConcern).toEqual({ w: 'majority', wtimeoutMS: 10000 })
})
it('persists explicit SMTP failure, refuses public resend and permits one successful owner retry', async () => {
  const send = vi.fn().mockRejectedValueOnce(Object.assign(Error('No'), { responseCode: 451 })).mockResolvedValue(accepted())
  expect(await notify({ send })).toBe('failed'); expect(await notify({ send })).toBe('failed'); expect(send).toHaveBeenCalledOnce()
  expect(await notify({ send, retry: true })).toBe('accepted'); expect(send).toHaveBeenCalledTimes(2)
  expect(store.docs.get(input.clientRequestId).status).toBe('new')
})
it('caps explicit failed retries at three and keeps the saved request', async () => {
  const send = vi.fn().mockRejectedValue(Object.assign(Error('Auth rejected'), { code: 'EAUTH' }))
  for (let i=0; i<8; i++) expect(await notify({ send, retry: true })).toBe('failed')
  expect(send).toHaveBeenCalledTimes(3); expect(store.docs.size).toBe(1)
})
it.each([Error('Socket closed after DATA'), Object.assign(Error('Timeout'), { code: 'ETIMEDOUT' })])('does not retry ambiguous SMTP outcome %s', async error => {
  const send = vi.fn().mockRejectedValue(error)
  expect(await notify({ send })).toBe('uncertain'); expect(await notify({ send, retry: true })).toBe('uncertain'); expect(send).toHaveBeenCalledOnce()
})
it('bounds the send wait and blocks resend after a later provider acceptance', async () => {
  let finish; const send = vi.fn(() => new Promise(resolve => finish = resolve))
  expect(await notify({ send, timeoutMs: 5 })).toBe('uncertain'); finish(accepted())
  expect(await notify({ send, retry: true })).toBe('uncertain'); expect(send).toHaveBeenCalledOnce()
})
it.each([undefined, {}, { accepted: ['wrong@example.invalid'] }])('does not claim success without provider recipient acceptance %j', async info => {
  expect(await notify({ send: async () => info })).toBe('uncertain')
})
it('records explicit recipient rejection as retryable failure', async () => {
  expect(await notify({ send: async () => ({ rejected: [BULK_OWNER_EMAIL] }) })).toBe('failed')
})
it('records missing mail configuration without consuming an attempt or sending, and permits owner retry after setup', async () => {
  const send = vi.fn(async () => accepted())
  expect(await notify({ env: {}, send })).toBe('not_configured'); expect(send).not.toHaveBeenCalled()
  expect(await notify({ send })).toBe('not_configured'); expect(send).not.toHaveBeenCalled()
  expect(await notify({ send, retry: true })).toBe('accepted'); expect(send).toHaveBeenCalledOnce()
})
it('does not backfill legacy enquiries when public requests or owners retry', async () => {
  store.docs.get(input.clientRequestId).notifications.email = 'not_configured'
  const send = vi.fn(); expect(await notify({ send, retry: true })).toBe('not_configured'); expect(send).not.toHaveBeenCalled()
})
it('reports a stale durable sending claim as uncertain and never reclaims it', async () => {
  store.docs.get(input.clientRequestId).notifications.email = { status: 'sending', attempts: 1, startedAt: new Date(0) }
  const send = vi.fn(); expect(await notify({ send, retry: true })).toBe('uncertain'); expect(send).not.toHaveBeenCalled()
})
it('never sends after losing the atomic claim acknowledgement', async () => {
  const update = store.findOneAndUpdate.getMockImplementation(); store.findOneAndUpdate.mockImplementationOnce(async (...args) => { await update(...args); throw Error('Lost claim ack') })
  const send = vi.fn(); expect(await notify({ send })).toBe('uncertain'); expect(await notify({ send, retry: true })).toBe('sending'); expect(send).not.toHaveBeenCalled()
})
it('recovers an accepted status whose database acknowledgement was lost without duplicate delivery', async () => {
  const update = store.findOneAndUpdate.getMockImplementation(); let calls=0
  store.findOneAndUpdate.mockImplementation(async (...args) => { const result = await update(...args); if (++calls === 2) throw Error('Lost status ack'); return result })
  const send = vi.fn(async () => accepted()); expect(await notify({ send })).toBe('uncertain'); expect(await notify({ send, retry: true })).toBe('accepted'); expect(send).toHaveBeenCalledOnce()
})
it('keeps a claim blocked if recording provider acceptance fails before writing', async () => {
  const update = store.findOneAndUpdate.getMockImplementation(); let calls=0
  store.findOneAndUpdate.mockImplementation(async (...args) => { if (++calls === 2) throw Error('Write unavailable'); return update(...args) })
  const send = vi.fn(async () => accepted()); expect(await notify({ send })).toBe('uncertain'); expect(await notify({ send, retry: true })).toBe('sending'); expect(send).toHaveBeenCalledOnce()
})
it('does not call the provider if the durable claim database is unavailable', async () => {
  store.findOneAndUpdate.mockRejectedValue(Error('Database unavailable')); const send = vi.fn()
  expect(await notify({ send })).toBe('uncertain'); expect(send).not.toHaveBeenCalled()
})
it('keeps one delivery address and marks unpriced geometry or prices as requiring quotation', () => {
  const doc = store.docs.get(input.clientRequestId); doc.fulfilment = 'delivery'; doc.address = 'SYNTHETIC ADDRESS'; doc.lines[0].lineCents=null; doc.totalCents=null
  const message=bulkOwnerMessage(doc)
  expect(message.text).toContain('Delivery enquiry: SYNTHETIC ADDRESS'); expect(message.text).not.toContain('Collection:')
  expect(message.text).toContain('Indicative filament total: Quotation required'); expect(message.text).toContain('Indicative line total: Quotation required')
})
it('handles legacy absent notification data without promising an alert', () => { expect(bulkEmailStatus({})).toBe('not_configured') })
