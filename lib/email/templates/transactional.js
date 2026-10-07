/**
 * Pure builders for the previously-inline transactional emails, restyled onto
 * the shared light-theme base layout. No I/O — `(data) => { subject, html }`.
 *
 *  - buildOrderConfirmationEmail   → customer, after checkout
 *  - buildNewSaleEmail             → creator, on a new sale (Stripe webhook)
 *  - buildDeliveryTypeChangedEmail → creator, when an admin edits a delivery type
 */
import {
  emailLayout,
  bodyBlock,
  infoTable,
  ctaButton,
  esc,
  money,
  SITE_URL,
} from '@/lib/email/template'

const ACCOUNT_ORDERS_URL = `${SITE_URL}/account?tab=orders`
const DASHBOARD_URL = `${SITE_URL}/dashboard`
const DASHBOARD_PRODUCTS_URL = `${SITE_URL}/dashboard/products`

/** Customer order confirmation (shop orders). */
export function buildOrderConfirmationEmail({ customerName, orderRef, total, currency = 'sgd', items = [] } = {}) {
  const greeting = customerName ? `Hi ${esc(customerName)},` : 'Dear Customer,'
  const purchaseRows = items.map(item => [
    `${item.productName || item.name || 'Item'} x${item.quantity || 1}`,
    `${Object.entries(item.selectedVariants || {}).map(([key, value]) => `${key}: ${value}`).join(', ')}${item.totalPrice != null ? ` — ${money(item.totalPrice, currency)}` : ''}`,
  ])
  const html = emailLayout({
    title: 'Order confirmed — thank you!',
    preheader: 'Your order was received and is now being processed.',
    bodyHtml:
      bodyBlock({
        heading: 'Thank you for your order!',
        paragraphs: [
          greeting,
          `Your order has been successfully received and is now being processed. Here's what happens next:`,
        ],
      }) +
      infoTable([
        ['Order', orderRef],
        ['Payment', total != null ? `Paid — ${money(total, currency)}` : null],
        ...purchaseRows,
        ['1 · Processing', 'We are preparing your order — track it under "Orders".'],
        ['2 · Delivery', 'Ships to your provided address; delivery time varies by location.'],
      ]) +
      ctaButton({ href: ACCOUNT_ORDERS_URL, label: 'View my orders' }),
  })
  return {
    subject: 'Fix It Today — Order Confirmation',
    html,
  }
}

/** Creator notification: a new sale came in. `items` is [{ name, quantity, price, currency }]. */
export function buildNewSaleEmail({ total, currency = 'sgd', items = [], orderRef } = {}) {
  const itemsHtml = (items || [])
    .map(
      (i) =>
        `<li style="margin-bottom:4px;">${esc(i?.name)} ×${esc(i?.quantity ?? 1)} — ${esc(
          money(i?.price, i?.currency || currency),
        )}</li>`,
    )
    .join('')

  const html = emailLayout({
    title: 'You have a new sale',
    preheader: `New sale${total != null ? ` — ${money(total, currency)}` : ''} on Fix It Today.`,
    bodyHtml:
      bodyBlock({
        heading: 'You have a new sale! 🎉',
        paragraphs: [`A new order has come in on Fix It Today.`],
      }) +
      (itemsHtml
        ? `<ul style="margin:0 0 16px 0;padding-left:18px;color:#67696b;">${itemsHtml}</ul>`
        : '') +
      infoTable([
        ['Total', total != null ? money(total, currency) : null],
        ['Order', orderRef],
      ]) +
      ctaButton({ href: DASHBOARD_URL, label: 'Manage this order' }),
  })
  return { subject: 'New sale on Fix It Today!', html }
}

/** Creator notification: a delivery type they use was edited by an admin. */
export function buildDeliveryTypeChangedEmail({ deliveryTypeName, displayName } = {}) {
  const name = displayName || deliveryTypeName || 'A delivery type'
  const html = emailLayout({
    title: 'A delivery type was updated',
    preheader: `${name} changed — review your product delivery settings.`,
    bodyHtml:
      bodyBlock({
        heading: 'Delivery type updated — action may be required',
        paragraphs: [
          `A delivery type used by your products has been updated. Please review your delivery settings to make sure they're still correct.`,
        ],
      }) +
      infoTable([['Delivery type', name]]) +
      ctaButton({ href: DASHBOARD_PRODUCTS_URL, label: 'Review delivery settings' }),
  })
  return { subject: 'Delivery type updated — action may be required', html }
}
