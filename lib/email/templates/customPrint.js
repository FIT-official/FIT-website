/**
 * Pure `(data) => { subject, html }` builders for every custom-print lifecycle
 * email. No I/O. User-supplied values are escaped via the base-layout `esc`.
 *
 * Shared input shape (`request`): a CustomPrintRequest-like object with
 * `requestId`, `userName`/`userEmail`, `currency`, `modelFile.originalName`,
 * `status`, `trackingNumber`, `estimatedDelivery`. Pricing comes from a
 * pre-computed `breakdown` ({ lines, total, currency }) so the email matches
 * exactly what the cart/checkout charge (single source of truth).
 */
import {
  emailLayout,
  bodyBlock,
  breakdownTable,
  infoTable,
  ctaButton,
  esc,
  money,
  SITE_URL,
} from '@/lib/email/template'
import { modelPreviewBlock } from '@/lib/email/modelPreviewBlock'

const CART_URL = `${SITE_URL}/cart`
const ACCOUNT_URL = `${SITE_URL}/account`

function customerName(request) {
  return request?.userName || request?.userEmail || 'there'
}

function modelName(request) {
  return request?.modelFile?.originalName || 'your model'
}

/** Quote/charge lines → breakdownTable input. Falls back to a single total. */
function linesFrom(breakdown) {
  const b = breakdown || {}
  if (Array.isArray(b.lines) && b.lines.length) {
    const lines = b.lines.map((l) => ({ label: l.label, amount: l.amount }))
    if (Number(b.deliveryFee) > 0) lines.push({ label: 'Delivery', amount: b.deliveryFee })
    return lines
  }
  const lines = []
  if (Number(b.amount) >= 0) lines.push({ label: 'Print', amount: b.amount, always: true })
  if (Number(b.deliveryFee) > 0) lines.push({ label: 'Delivery', amount: b.deliveryFee })
  return lines
}

/** 1. Manual config submitted — quote will follow. */
export function buildAwaitingQuoteEmail({ request } = {}) {
  const reqId = request?.requestId || ''
  const html = emailLayout({
    title: 'We received your print configuration',
    preheader: 'Your custom print is being reviewed for a quote.',
    bodyHtml:
      bodyBlock({
        heading: 'Your configuration is in — quote on the way',
        paragraphs: [
          `Hi ${esc(customerName(request))},`,
          `Thanks for setting up your custom print for <b>${esc(modelName(request))}</b>. Our team is reviewing your advanced settings and will send your quote shortly.`,
          `We'll email you as soon as it's ready so you can review and pay.`,
        ],
      }) +
      infoTable([['Request ID', reqId]]) +
      ctaButton({ href: ACCOUNT_URL, label: 'View my requests' }),
  })
  return { subject: `We're preparing your custom-print quote — ${reqId}`, html }
}

/** 2. Quote ready (instant or manual) — pay now. */
export function buildQuoteReadyEmail({ request, breakdown } = {}) {
  const reqId = request?.requestId || ''
  const currency = breakdown?.currency || request?.currency || 'sgd'
  const total = breakdown?.total ?? breakdown?.amount ?? 0
  const html = emailLayout({
    title: 'Your custom-print quote is ready',
    preheader: `Your quote: ${money(total, currency)}. Review and pay to start printing.`,
    bodyHtml:
      bodyBlock({
        heading: 'Your quote is ready',
        paragraphs: [
          `Hi ${esc(customerName(request))},`,
          `Here's the quote for <b>${esc(modelName(request))}</b>. Review the breakdown below and check out when you're ready — we start printing once payment is confirmed.`,
        ],
      }) +
      breakdownTable({ lines: linesFrom(breakdown), total, currency }) +
      ctaButton({ href: CART_URL, label: 'Review & pay' }) +
      infoTable([['Request ID', reqId]]),
  })
  return { subject: `Your custom-print quote is ready — ${money(total, currency)}`, html }
}

/** 3. Payment received — work starting (customer). */
export function buildPaymentReceivedEmail({ request, breakdown } = {}) {
  const reqId = request?.requestId || ''
  const currency = breakdown?.currency || request?.currency || 'sgd'
  const total = breakdown?.total ?? breakdown?.amount ?? 0
  const html = emailLayout({
    title: 'Payment received — your print is queued',
    preheader: `We received ${money(total, currency)}. Your print is queued.`,
    bodyHtml:
      bodyBlock({
        heading: 'Payment received — thank you!',
        paragraphs: [
          `Hi ${esc(customerName(request))},`,
          `We've received your payment for <b>${esc(modelName(request))}</b> and your print is now queued. We'll keep you posted as it moves through printing and shipping.`,
        ],
      }) +
      breakdownTable({ lines: linesFrom(breakdown), total, currency, totalLabel: 'Paid' }) +
      ctaButton({ href: ACCOUNT_URL, label: 'Track my order' }) +
      infoTable([['Request ID', reqId]]),
  })
  return { subject: `Payment received for your custom print — ${reqId}`, html }
}

const STATUS_COPY = Object.freeze({
  printing: {
    heading: 'Your print has started',
    line: 'Good news — your model is now on the printer.',
  },
  printed: {
    heading: 'Your print is complete',
    line: 'Your model has finished printing and is being prepared for dispatch.',
  },
  shipped: {
    heading: 'Your order is on its way',
    line: 'Your print has shipped.',
  },
  delivered: {
    heading: 'Delivered — enjoy!',
    line: 'Your print has been delivered. We hope it turned out great.',
  },
})

/** 4. Status update (printing/printed/shipped/delivered). */
export function buildStatusUpdateEmail({ request, status } = {}) {
  const reqId = request?.requestId || ''
  const copy = STATUS_COPY[status] || {
    heading: 'Update on your custom print',
    line: `Your request status is now "${status}".`,
  }
  const rows = [['Request ID', reqId], ['Status', status]]
  if (status === 'shipped') {
    if (request?.trackingNumber) rows.push(['Tracking number', request.trackingNumber])
    if (request?.estimatedDelivery) {
      const d = new Date(request.estimatedDelivery)
      if (!Number.isNaN(d.getTime())) rows.push(['Estimated delivery', d.toDateString()])
    }
  }
  const html = emailLayout({
    title: copy.heading,
    preheader: copy.line,
    bodyHtml:
      bodyBlock({
        heading: copy.heading,
        paragraphs: [`Hi ${esc(customerName(request))},`, esc(copy.line)],
      }) +
      infoTable(rows) +
      ctaButton({ href: ACCOUNT_URL, label: 'View my order' }),
  })
  return { subject: `${copy.heading} — ${reqId}`, html }
}

/** 5. Cancelled. */
export function buildCancelledEmail({ request, note } = {}) {
  const reqId = request?.requestId || ''
  const html = emailLayout({
    title: 'Your custom-print request was cancelled',
    preheader: 'Your custom-print request has been cancelled.',
    bodyHtml:
      bodyBlock({
        heading: 'Your request was cancelled',
        paragraphs: [
          `Hi ${esc(customerName(request))},`,
          `Your custom-print request for <b>${esc(modelName(request))}</b> has been cancelled.`,
          note ? `<b>Note:</b> ${esc(note)}` : '',
          `If this was a mistake or you have questions, just reply to this email.`,
        ],
      }) + infoTable([['Request ID', reqId]]),
  })
  return { subject: `Your custom-print request was cancelled — ${reqId}`, html }
}

const NUDGE_COPY = Object.freeze({
  pending_config: {
    line: 'Your model is uploaded but not configured yet. Pick your settings to get an instant quote.',
    cta: { href: CART_URL, label: 'Configure my print' },
  },
  configured: {
    line: "You've configured your print — request a quote whenever you're ready.",
    cta: { href: CART_URL, label: 'Get my quote' },
  },
  quoted: {
    line: 'Your quote is ready and waiting. Check out to start printing.',
    cta: { href: CART_URL, label: 'Review & pay' },
  },
})

/**
 * Gentle nudge for a request idle in a pre-payment state. Optional `models` + `previews` (prepared server-side by `prepareNudgePreviews`) add the customer's own model preview(s)
 * and saved facts; without them the email is exactly the original. Previews are referenced as `cid:` attachments only.
 */
export function buildIdleNudgeEmail({ request, models, previews } = {}) {
  const reqId = request?.requestId || ''
  const copy = NUDGE_COPY[request?.status] || {
    line: "Your custom print is waiting — pick up where you left off whenever you're ready.",
    cta: { href: CART_URL, label: 'Continue my print' },
  }
  const count = Array.isArray(models) ? models.length : 0
  const printName = count > 1 ? `your ${count} models` : request?.modelFile?.originalName || (count === 1 && models[0]?.fileName ? models[0].fileName : '') || 'your model'
  const html = emailLayout({
    title: 'Your custom print is waiting',
    preheader: copy.line,
    bodyHtml:
      bodyBlock({
        heading: 'Still interested in your print?',
        paragraphs: [
          `Hi ${esc(customerName(request))},`,
          `We noticed your custom print for <b>${esc(printName)}</b> is still in progress. ${esc(copy.line)}`,
          `Need a hand? Just reply to this email and we'll help.`,
        ],
      }) +
      modelPreviewBlock({ request, models, previews }) +
      ctaButton(copy.cta) +
      infoTable([['Request ID', reqId]]),
  })
  return { subject: 'Your custom print is waiting for you', html }
}

/** Admin: a new request was submitted. */
export function buildNewRequestAdminEmail({ request } = {}) {
  const reqId = request?.requestId || ''
  const html = emailLayout({
    title: 'New custom-print request',
    preheader: `New request ${reqId} from ${customerName(request)}.`,
    bodyHtml:
      bodyBlock({
        heading: 'New custom-print request',
        paragraphs: [
          `A new custom-print request has been submitted by <b>${esc(customerName(request))}</b>.`,
        ],
      }) +
      infoTable([
        ['Request ID', reqId],
        ['Customer', request?.userEmail],
        ['Model', request?.modelFile?.originalName],
      ]) +
      ctaButton({ href: `${SITE_URL}/admin`, label: 'Open admin dashboard' }),
  })
  return { subject: `New custom-print request — ${reqId}`, html }
}

/** Admin: payment received, start work. */
export function buildPaymentReceivedAdminEmail({ request, breakdown } = {}) {
  const reqId = request?.requestId || ''
  const currency = breakdown?.currency || request?.currency || 'sgd'
  const total = breakdown?.total ?? breakdown?.amount ?? 0
  const html = emailLayout({
    title: 'Custom print paid — start work',
    preheader: `Paid ${money(total, currency)} — ${reqId} is ready to print.`,
    bodyHtml:
      bodyBlock({
        heading: 'A custom print was paid — ready to start',
        paragraphs: [
          `Payment of <b>${esc(money(total, currency))}</b> has been received for request <b>${esc(reqId)}</b>.`,
        ],
      }) +
      infoTable([
        ['Request ID', reqId],
        ['Customer', request?.userEmail],
        ['Model', request?.modelFile?.originalName],
      ]) +
      ctaButton({ href: `${SITE_URL}/admin`, label: 'Open admin dashboard' }),
  })
  return { subject: `Custom print paid — start work — ${reqId}`, html }
}
