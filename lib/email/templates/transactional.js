import { emailLayout, emailResult, bodyBlock, infoTable, ctaButton, esc, money, SITE_URL } from '@/lib/email/template'
const ACCOUNT_ORDERS_URL = `${SITE_URL}/account?tab=orders`
const DASHBOARD_URL = `${SITE_URL}/dashboard`
const deliveryLabel = type => ({ 'pick-up': 'Collection', pickup: 'Collection', collection: 'Collection', digital: 'Digital delivery', 'standard-shipping': 'Standard shipping', 'express-shipping': 'Express shipping' }[type] || type)
function itemRows(items, currency, snapshot = false) {
  return items.map(item => {
    const name = snapshot ? item.productName : item.name
    const quantity = Number.isSafeInteger(item.quantity) && item.quantity > 0 ? ` x ${item.quantity}` : ''
    const price = snapshot ? (Number.isSafeInteger(item.totalAmount) ? item.totalAmount / 100 : null) : item.price
    return `<div style="margin:0 0 16px;word-break:break-word;overflow-wrap:anywhere"><strong>${esc(name || 'Order item')}${quantity}</strong>${infoTable([
      [snapshot ? 'Line total including allocated delivery' : 'Unit price', price != null ? money(price, item.currency || currency) : null],
      ['Fulfilment', item.chosenDeliveryType ? deliveryLabel(item.chosenDeliveryType) : null], ['Item remarks', item.orderNote],
    ])}</div>`
  }).join('')
}
export function buildOrderConfirmationEmail({ customerName, checkout, orderRef, order } = {}) {
  const items = Array.isArray(checkout?.items) ? checkout.items : []
  const currency = checkout?.currency || order?.currency
  const total = Number.isSafeInteger(checkout?.totalAmount) ? checkout.totalAmount / 100 : null
  const methods = [...new Set(items.map(i => i.chosenDeliveryType).filter(Boolean))]
  const details = methods.map(type => deliveryLabel(type)).join(', ')
  const html = emailLayout({ title: 'Order confirmed - thank you!', preheader: 'Your payment is recorded. Review your order details.', reference: order?.orderId || orderRef, detailsUrl: ACCOUNT_ORDERS_URL,
    bodyHtml: bodyBlock({ heading: 'Thank you for your order!', paragraphs: [customerName ? `Hi ${esc(customerName)},` : 'Dear Customer,', 'Your order has been received. You can track its status and review the recorded delivery or collection arrangement in your account.'] }) + itemRows(items, currency, true) + infoTable([['Paid total', total != null ? money(total, currency) : null], ['Recorded fulfilment', details]]) + ctaButton({ href: ACCOUNT_ORDERS_URL, label: 'View my orders' }),
  })
  return emailResult('Fix It Today - Order Confirmation', html)
}
export function buildNewSaleEmail({ total, currency = 'sgd', items = [], orderRef } = {}) {
  return emailResult('New sale on Fix It Today!', emailLayout({ title: 'You have a new sale', preheader: 'Review the paid order and prepare the recorded items.', reference: orderRef, detailsUrl: DASHBOARD_URL,
    bodyHtml: bodyBlock({ heading: 'You have a new sale!', paragraphs: ['A new order has come in on Fix It Today. Review its items and fulfilment details before preparation.'] }) + itemRows(items || [], currency) + infoTable([['Total', total != null ? money(total, currency) : null]]) + ctaButton({ href: DASHBOARD_URL, label: 'Manage this order' }),
  }))
}
export function buildDeliveryTypeChangedEmail({ deliveryTypeName, displayName } = {}) {
  const name = displayName || deliveryTypeName || 'A delivery type'
  return emailResult('Delivery type updated - action may be required', emailLayout({ title: 'A delivery type was updated', preheader: `${name} changed - review your product delivery settings.`,
    bodyHtml: bodyBlock({ heading: 'Delivery type updated', paragraphs: ['A delivery type used by your products has been updated. Review your delivery settings to make sure they are still correct.'] }) + infoTable([['Delivery type', name]]) + ctaButton({ href: `${DASHBOARD_URL}/products`, label: 'Review delivery settings' }),
  }))
}
