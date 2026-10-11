import { describe, it, expect } from 'vitest'
import {
  buildAwaitingQuoteEmail,
  buildQuoteReadyEmail,
  buildPaymentReceivedEmail,
  buildStatusUpdateEmail,
  buildCancelledEmail,
  buildNewRequestAdminEmail,
  buildPaymentReceivedAdminEmail,
} from '@/lib/email/templates/customPrint'

const request = {
  requestId: 'req-123',
  userName: 'Ada',
  userEmail: 'ada@test.com',
  currency: 'sgd',
  modelFile: { originalName: 'dragon<x>.stl' },
}

const breakdown = {
  currency: 'sgd',
  amount: 30,
  deliveryFee: 5,
  total: 35,
  lines: [
    { key: 'material', label: 'Material', amount: 20 },
    { key: 'printTime', label: 'Print time', amount: 10 },
  ],
}

describe('custom-print email builders', () => {
  it('awaiting-quote names the customer + request id', () => {
    const { subject, html } = buildAwaitingQuoteEmail({ request })
    expect(subject).not.toContain('req-123')
    expect(html).toContain('Ada')
    expect(html).toContain('req-123')
    // model file name is escaped
    expect(html).toContain('dragon&lt;x&gt;.stl')
  })

  it('quote-ready shows breakdown lines, delivery, total + pay CTA', () => {
    const { subject, html } = buildQuoteReadyEmail({ request, breakdown })
    expect(subject).toContain('SGD 35.00')
    expect(html).toContain('Material')
    expect(html).toContain('Print time')
    expect(html).toContain('Delivery')
    expect(html).toContain('SGD 35.00')
    expect(html.toLowerCase()).toContain('/cart')
  })

  it('payment-received labels the total as Paid', () => {
    const { html } = buildPaymentReceivedEmail({ request, breakdown })
    expect(html).toContain('Paid')
    expect(html).toContain('SGD 35.00')
  })

  it('status-update includes tracking for shipped', () => {
    const { subject, html } = buildStatusUpdateEmail({
      request: { ...request, trackingNumber: 'TRK9' },
      status: 'shipped',
    })
    expect(subject.toLowerCase()).toContain('way')
    expect(html).toContain('TRK9')
  })

  it('status-update handles printing', () => {
    const { html } = buildStatusUpdateEmail({ request, status: 'printing' })
    expect(html).toContain('printer')
  })

  it('cancelled includes the note', () => {
    const { html } = buildCancelledEmail({ request, note: 'out of stock' })
    expect(html).toContain('out of stock')
    expect(html).toContain('req-123')
  })

  it('admin new-request + paid include customer + request id', () => {
    expect(buildNewRequestAdminEmail({ request }).html).toContain('req-123')
    const paid = buildPaymentReceivedAdminEmail({ request, breakdown })
    expect(paid.subject).not.toContain('req-123')
    expect(paid.html).toContain('req-123')
    expect(paid.html).toContain('SGD 35.00')
  })
})
