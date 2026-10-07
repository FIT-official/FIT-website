import { describe, it, expect } from 'vitest'
import {
  buildOrderConfirmationEmail,
  buildNewSaleEmail,
  buildDeliveryTypeChangedEmail,
} from '@/lib/email/templates/transactional'

describe('transactional email builders (restyled)', () => {
  it('includes the paid purchase snapshot and escaped selected options', () => {
    const items = [{ productName: 'PETG', quantity: 1, selectedVariants: { Colour: 'Black <test>' }, totalPrice: 13.90 }]
    const buyer = buildOrderConfirmationEmail({ orderRef: 'ORD_cs_test', total: 13.90, items }).html
    expect(buyer).toContain('ORD_cs_test')
    expect(buyer).toContain('SGD 13.90')
    expect(buyer).toContain('Colour: Black &lt;test&gt;')
  })
  it('order confirmation greets by name and links to orders', () => {
    const { subject, html } = buildOrderConfirmationEmail({ customerName: 'Ada' })
    expect(subject).toMatch(/confirmation/i)
    expect(html).toContain('Ada')
    expect(html.toLowerCase()).toContain('/account?tab=orders')
    // restyled onto the light base layout (no legacy dark wrapper)
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('order confirmation falls back to "Dear Customer" without a name', () => {
    const { html } = buildOrderConfirmationEmail({})
    expect(html).toContain('Dear Customer')
  })

  it('new-sale lists items + total', () => {
    const { html } = buildNewSaleEmail({
      total: 42,
      currency: 'sgd',
      items: [{ name: 'Widget', quantity: 2, price: 21, currency: 'sgd' }],
    })
    expect(html).toContain('Widget')
    expect(html).toContain('×2')
    expect(html).toContain('SGD 42.00')
  })

  it('new-sale escapes item names', () => {
    const { html } = buildNewSaleEmail({ items: [{ name: '<b>x</b>', quantity: 1, price: 1 }] })
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
  })

  it('delivery-type-changed names the type and links to settings', () => {
    const { subject, html } = buildDeliveryTypeChangedEmail({
      deliveryTypeName: 'courier',
      displayName: 'Courier',
    })
    expect(subject).toMatch(/delivery type/i)
    expect(html).toContain('Courier')
    expect(html.toLowerCase()).toContain('/dashboard/products')
  })
})
