// @vitest-environment node
import { expect, it, vi } from 'vitest'
const mail = vi.hoisted(() => vi.fn(() => { throw Error('Provider calls forbidden') }))
vi.mock('@/lib/email', () => ({ sendEmail: mail }))
import { OWNER_DIGEST_DELIVERY_ENABLED } from '@/lib/notifications/ownerDigestPolicy'
import { notifyGuidedEnquiryOwner, notifyPaidOrderOwner } from '@/lib/notifications/ownerDigest'

it('has a hard disabled production policy even with credentials and activation-looking overrides', async () => {
  expect(OWNER_DIGEST_DELIVERY_ENABLED).toBe(false)
  const store = { findOne: vi.fn(() => { throw Error('No DB access while disabled') }), findOneAndUpdate: vi.fn() }
  const loadCheckout = vi.fn(), injectedSend = vi.fn()
  const config = { enabled: true, retry: true, send: injectedSend, loadCheckout,
    env: { OWNER_DIGEST_DELIVERY_ENABLED: 'true', GMAIL_USER: 'synthetic@example.invalid', GMAIL_PASSWORD: 'synthetic-not-a-credential' } }
  expect(await notifyGuidedEnquiryOwner(store, 'guided-synthetic', config)).toEqual({ status: 'disabled', attempts: 0 })
  expect(await notifyPaidOrderOwner(store, 'cs_synthetic', config)).toEqual({ status: 'disabled', attempts: 0 })
  expect(mail).not.toHaveBeenCalled();expect(injectedSend).not.toHaveBeenCalled();expect(loadCheckout).not.toHaveBeenCalled()
  expect(store.findOne).not.toHaveBeenCalled();expect(store.findOneAndUpdate).not.toHaveBeenCalled()
})
