// @vitest-environment node
import { expect, it } from 'vitest'
import { buildGuidedOwnerDigest, buildPaidOrderOwnerDigest } from '@/lib/notifications/ownerDigestMessage'
import { OWNER_DIGEST_EMAIL } from '@/lib/notifications/ownerDigestPolicy'
import { guidedFixture, paidFixture } from '../fixtures/ownerDigest'

it('renders every guided preference and exact remarks before payment, using only the verified owner', () => {
  const source = guidedFixture(), original = structuredClone(source), out = buildGuidedOwnerDigest(source)
  expect(out.to).toBe(OWNER_DIGEST_EMAIL); expect(out).not.toHaveProperty('cc'); expect(out).not.toHaveProperty('bcc')
  expect(out.text.startsWith('Customer: Synthetic Customer\nPhone: Not recorded in this source snapshot\nAddress / collection:')).toBe(true)
  for (const value of ['Desk bracket', 'Replacement part', 'https://example.com/design/1', 'Copies requested: 3', '10 cm longest side (100 mm)', 'PLA', 'White', 'Bag copies separately\n    Keep the labels', 'synthetic-private-reference', 'unverified): unknown']) expect(out.text).toContain(value)
  expect(out.text.indexOf('Item remarks:')).toBeLessThan(out.text.indexOf('Payment / Stripe'))
  expect(out.text).toContain('No payment taken'); expect(out.text).toContain('No stock is reserved')
  expect(source).toEqual(original); expect(buildGuidedOwnerDigest(source).messageId).toBe(out.messageId)
})

it('renders the committed paid preparation list before exact recorded payment details', () => {
  const source = paidFixture(), original = structuredClone(source), out = buildPaidOrderOwnerDigest(source)
  expect(out.text.startsWith('Customer: Synthetic Customer\nPhone: +65 80000000\nDelivery address: 1 Synthetic Road, #01-01, Singapore, 000000, SG')).toBe(true)
  for (const value of ['Synthetic filament', 'Purchased quantity: 2', 'Colour: White', 'Packaging: Refill', 'Keep both refills labelled',
    'Copies to prepare in this paid print line: 3', 'bracket.stl version 2', 'Filament: pla', 'Layer height (mm): 0.2', 'Wall loops: 3',
    'Infill (%): 20', 'Synthetic job-specific permission record', 'Recorded Post-processing: yes', 'Recorded Expedite: yes', 'Supports: false', 'Mesh colour part: #FFFFFF', 'pi_synthetic_paid', 'cs_synthetic_paid', '2026-10-10T12:00:00.000Z',
    'Items after recorded discounts: SGD 34.00', 'Recorded delivery total: SGD 6.20', 'Recorded paid total: SGD 40.20']) expect(out.text).toContain(value)
  expect(out.text.indexOf('Protect the small tabs')).toBeLessThan(out.text.indexOf('Payment / Stripe'))
  expect(out.text).not.toContain('secret-private'); expect(out.text).not.toContain('private-do-not-include'); expect(out.text).not.toContain('2099')
  expect(out.html).not.toContain('<script>'); expect(out.html).toContain('&lt;script&gt;test&lt;/script&gt;')
  expect(source).toEqual(original)
})

it('uses Maps and saved configuration without querying mutable data or downloading model URLs', () => {
  const source = paidFixture();source.checkout.items[0].selectedVariants = new Map([['Colour', 'White']])
  expect(buildPaidOrderOwnerDigest(source).text).toContain('Selected options: Colour: White')
})

it('shows absent snapshot phone and payment method honestly', () => {
  const source = paidFixture();delete source.checkout.customerPhone;delete source.order.paymentMethod;delete source.order.stripePaymentIntentId
  const out = buildPaidOrderOwnerDigest(source)
  expect(out.text).toContain('Phone: Not recorded in this source snapshot');expect(out.text).toContain('Stripe payment intent: Not recorded')
  expect(out.text).toContain('Recorded payment method: Not recorded')
})

it('preserves pickup instructions and does not invent a delivery address', () => {
  const source = paidFixture();source.checkout.items.forEach(i => { i.chosenDeliveryType = 'pick-up' })
  source.checkout.items[1].customRequest.delivery = { deliveryTypes: [{ type: 'pick-up', pickupLocation: 'Recorded synthetic counter', customDescription: 'Await staff confirmation' }] }
  const out = buildPaidOrderOwnerDigest(source)
  expect(out.text).toContain('Collection: selected');expect(out.text).toContain('Recorded synthetic counter');expect(out.text).not.toContain('Delivery address:')
})

it('warns about inconsistent saved fulfilment instead of silently choosing or changing it', () => {
  const source = paidFixture();source.checkout.items[1].chosenDeliveryType = 'pick-up'
  const out = buildPaidOrderOwnerDigest(source)
  expect(out.text).toContain('REVIEW REQUIRED: multiple physical fulfilment methods');expect(out.text).toContain('standard-shipping, pick-up')
})

it('identifies a missing recorded delivery address and digital-only fulfilment', () => {
  const source = paidFixture();source.checkout.shippingAddress = null
  expect(buildPaidOrderOwnerDigest(source).text).toContain('NOT RECORDED — staff review required')
  source.checkout.items.forEach(i => { i.chosenDeliveryType = 'digital' })
  expect(buildPaidOrderOwnerDigest(source).text).toContain('Fulfilment: digital; no physical delivery or collection.')
})

it.each([
  ['unfinished checkout', s => { s.checkout.status = 'pending' }],
  ['legacy snapshot', s => { delete s.checkout.snapshotVersion }],
  ['foreign order', s => { s.order.userId = 'another-user' }],
  ['foreign session', s => { s.order.stripeSessionId = 'cs_other' }],
  ['absent confirmation', s => { delete s.order.paidConfirmedAt }],
  ['invalid confirmation', s => { s.order.paidConfirmedAt = 'not-a-date' }],
  ['order total mismatch', s => { s.order.totalAmount = 1 }],
  ['snapshot total mismatch', s => { s.checkout.totalAmount = 1 }],
  ['line total mismatch', s => { s.checkout.items[0].totalAmount = 1 }],
  ['negative quantity', s => { s.checkout.items[0].quantity = -1 }],
  ['negative delivery', s => { s.checkout.items[0].deliveryAmount = -1 }],
  ['mixed currency', s => { s.checkout.items[0].currency = 'usd' }],
  ['order currency mismatch', s => { s.order.currency = 'USD' }],
  ['header injection', s => { s.order.orderId = 'id\r\nBcc: attacker@example.invalid' }],
  ['corrupt guided brief', s => { s.checkout.items[1].customRequest.guidedBrief.quantity = 0 }],
])('refuses %s instead of composing a plausible-looking paid digest', (_name, mutate) => {
  const source = paidFixture();mutate(source);expect(() => buildPaidOrderOwnerDigest(source)).toThrow()
})

it('refuses missing/creator/corrupt enquiries and oversized content rather than truncating instructions', () => {
  expect(() => buildGuidedOwnerDigest(null)).toThrow()
  expect(() => buildGuidedOwnerDigest({ ...guidedFixture(), creatorUserId: 'another-creator' })).toThrow()
  const source = guidedFixture();source.guidedBrief.quantity = 0;expect(() => buildGuidedOwnerDigest(source)).toThrow()
  const paid = paidFixture();paid.checkout.items[0].orderNote = 'x'.repeat(128 * 1024);expect(() => buildPaidOrderOwnerDigest(paid)).toThrow()
})
