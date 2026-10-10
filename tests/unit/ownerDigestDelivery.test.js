// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const mail = vi.hoisted(() => vi.fn(() => { throw Error('Provider forbidden') }))
// Test-only gate substitution; the actual production policy is tested separately.
vi.mock('@/lib/notifications/ownerDigestPolicy', () => ({ OWNER_DIGEST_DELIVERY_ENABLED: true, OWNER_DIGEST_EMAIL: 'fixittoday.contact@gmail.com' }))
vi.mock('@/lib/email', () => ({ sendEmail: mail }))
import { notifyGuidedEnquiryOwner, notifyPaidOrderOwner, ownerDigestStatus } from '@/lib/notifications/ownerDigest'
import { OWNER_DIGEST_EMAIL } from '@/lib/notifications/ownerDigestPolicy'
import { guidedFixture, paidFixture, memoryStore } from '../fixtures/ownerDigest'
const env = { GMAIL_USER: 'synthetic@example.invalid', GMAIL_PASSWORD: 'synthetic-not-a-credential' }
const accepted = () => ({ accepted: [OWNER_DIGEST_EMAIL] })
let store, send
beforeEach(() => { mail.mockReset();mail.mockImplementation(() => { throw Error('Provider forbidden') });store = memoryStore(guidedFixture());send = vi.fn(async () => accepted()) })
const notify = options => notifyGuidedEnquiryOwner(store, 'guided-synthetic-1', { env, send, ...options })

it('captures one complete message after a durable claim under 12 concurrent calls and later retries', async () => {
  await Promise.all(Array.from({ length: 12 }, () => notify()))
  expect(await notify({ retry: true })).toEqual({ status: 'accepted', attempts: 1 });expect(send).toHaveBeenCalledOnce()
  expect(mail).not.toHaveBeenCalled();expect(send.mock.calls[0][0].to).toBe(OWNER_DIGEST_EMAIL)
  expect(store.row.ownerDigest.status).toBe('accepted')
  expect(store.calls.every(call => call.options.writeConcern.w === 'majority' && !call.options.upsert)).toBe(true)
})

it('keeps the first immutable preparation message during explicit retry after source edits', async () => {
  send.mockRejectedValueOnce(Object.assign(Error('SMTP rejection'), { responseCode: 451 }))
  expect((await notify()).status).toBe('failed');const original = send.mock.calls[0][0]
  store.mutate(row => { row.userEmail = 'edited@example.invalid';row.guidedBrief.notes = 'later edit';row.guidedBrief.quantity = 99 })
  expect((await notify()).status).toBe('failed');expect(send).toHaveBeenCalledOnce()
  expect((await notify({ retry: true })).status).toBe('accepted');expect(send.mock.calls[1][0]).toEqual(original)
})

it.each([
  ['timeout', () => new Promise(() => {})],
  ['lost network acknowledgement', () => Promise.reject(Error('network disconnected'))],
  ['missing provider result', () => Promise.resolve({})],
])('quarantines %s permanently from automatic and explicit retries', async (_name, result) => {
  send.mockImplementation(result)
  expect((await notify({ timeoutMs: 2 })).status).toBe('uncertain')
  expect((await notify({ retry: true, timeoutMs: 2 })).status).toBe('uncertain');expect(send).toHaveBeenCalledOnce()
})

it('classifies explicit rejection and caps explicit retry attempts at three', async () => {
  send.mockResolvedValue({ rejected: [OWNER_DIGEST_EMAIL] })
  for (let i = 0; i < 7; i++) await notify({ retry: true })
  expect(send).toHaveBeenCalledTimes(3);expect(ownerDigestStatus(store.row)).toEqual({ status: 'failed', attempts: 3 })
})

it('retains not-configured state without sending and requires explicit retry after configuration', async () => {
  expect((await notify({ env: {} })).status).toBe('not_configured');expect(send).not.toHaveBeenCalled()
  expect((await notify()).status).toBe('not_configured');expect(send).not.toHaveBeenCalled()
  expect((await notify({ retry: true })).status).toBe('accepted')
})

it('cannot resend after a lost database acknowledgement of a durable claim', async () => {
  const update = store.findOneAndUpdate.bind(store)
  store.findOneAndUpdate = async (filter, value, options) => { const row = await update(filter, value, options);if (value.$set?.['ownerDigest.status'] === 'sending') throw Error('lost DB reply');return row }
  expect((await notify()).status).toBe('uncertain');expect(send).not.toHaveBeenCalled()
  await notify({ retry: true });expect(send).not.toHaveBeenCalled();expect(store.row.ownerDigest.status).toBe('sending')
})

it('cannot resend after a lost final database acknowledgement following SMTP acceptance', async () => {
  const update = store.findOneAndUpdate.bind(store)
  store.findOneAndUpdate = async (filter, value, options) => { const row = await update(filter, value, options);if (value.$set?.['ownerDigest.status'] === 'accepted') throw Error('lost DB reply');return row }
  expect((await notify()).status).toBe('uncertain');await notify({ retry: true });expect(send).toHaveBeenCalledOnce()
})

it('does not send if claim persistence fails before committing, or if source data cannot be read', async () => {
  store.findOneAndUpdate = async () => { throw Error('write unavailable') }
  expect((await notify()).status).toBe('uncertain');expect(send).not.toHaveBeenCalled()
  store.findOne = async () => { throw Error('read unavailable') }
  expect((await notify()).status).toBe('uncertain');expect(send).not.toHaveBeenCalled()
})

it('rejects altered/redirected saved snapshots and never accepts a caller destination', async () => {
  await notify({ env: {} });store.mutate(row => { row.ownerDigest.message.to = 'elsewhere@example.invalid' })
  expect((await notify({ retry: true })).status).toBe('invalid_record');expect(send).not.toHaveBeenCalled()
})

it('refuses invalid or ineligible sources before claiming or notifying', async () => {
  store.mutate(row => { row.guidedBrief.quantity = 0 });expect((await notify()).status).toBe('invalid_record')
  store.mutate(row => { row.status = 'cancelled' });expect((await notify()).status).toBe('not_eligible')
  expect((await notifyGuidedEnquiryOwner(store, { $ne: null }, { env, send })).status).toBe('invalid_record')
  expect(send).not.toHaveBeenCalled();expect(store.calls).toHaveLength(0)
})

it('uses the existing sendEmail abstraction when no injected transport is supplied', async () => {
  mail.mockResolvedValue(accepted())
  const result = await notifyGuidedEnquiryOwner(store, 'guided-synthetic-1', { env })
  expect(result.status).toBe('accepted');expect(mail).toHaveBeenCalledOnce()
})

it('captures one paid digest using only the matched recorded checkout/order, then reuses its snapshot', async () => {
  const paid = paidFixture(), orders = memoryStore(paid.order), loadCheckout = vi.fn(async () => paid.checkout)
  const action = config => notifyPaidOrderOwner(orders, paid.order.stripeSessionId, { env, send, loadCheckout, ...config })
  await Promise.all(Array.from({ length: 8 }, () => action()))
  expect((await action({ retry: true })).status).toBe('accepted');expect(send).toHaveBeenCalledOnce()
  expect(send.mock.calls[0][0].text).toContain('Recorded paid total: SGD 40.20')
  const before = loadCheckout.mock.calls.length;await action();expect(loadCheckout.mock.calls.length).toBe(before)
})

it('keeps unconfirmed, refunded, cancelled and unmatched paid records unsent', async () => {
  for (const status of ['cancelled','refunded','partially_refunded']) {
    const paid = paidFixture();paid.order.status = status
    expect((await notifyPaidOrderOwner(memoryStore(paid.order), paid.order.stripeSessionId, { env, send, loadCheckout: async () => paid.checkout })).status).toBe('not_eligible')
  }
  const paid = paidFixture();paid.checkout.userId = 'other'
  expect((await notifyPaidOrderOwner(memoryStore(paid.order), paid.order.stripeSessionId, { env, send, loadCheckout: async () => paid.checkout })).status).toBe('invalid_record')
  expect((await notifyPaidOrderOwner(memoryStore(paid.order), paid.order.stripeSessionId, { env, send })).status).toBe('invalid_record')
  expect(send).not.toHaveBeenCalled()
})

it('reports stale in-flight deliveries as uncertain, never retryable', () => {
  const now = new Date('2026-10-10T12:00:00Z')
  expect(ownerDigestStatus({ ownerDigest: { status: 'sending', startedAt: new Date(now - 120001), attempts: 1 } }, now).status).toBe('uncertain')
  expect(ownerDigestStatus({ ownerDigest: { status: 'sending', startedAt: 'invalid', attempts: 1 } }, now).status).toBe('uncertain')
  expect(ownerDigestStatus({ ownerDigest: { status: 'sending', startedAt: now, attempts: 1 } }, now).status).toBe('sending')
})

it('checks current source status in the atomic send claim, refusing a concurrent cancellation', async () => {
  const update = store.findOneAndUpdate.bind(store)
  store.findOneAndUpdate = async (filter, value, options) => {
    if (value.$set?.['ownerDigest.status'] === 'sending') store.mutate(row => { row.status = 'cancelled' })
    return update(filter, value, options)
  }
  expect((await notify()).status).toBe('not_eligible');expect(send).not.toHaveBeenCalled()
})
