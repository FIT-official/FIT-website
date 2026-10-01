import { validateCheckoutPayment } from './checkoutSnapshot';
import { isoCountryCode } from './isoCountryCodes';

// Pure whitelist builder; no I/O or Google requests.
// Call only with records fetched by the authenticated buyer's server route.
export function buildGooglePurchase({ ownerId, payment, checkout, order } = {}) {
    if (!ownerId || !payment || !checkout || !order || checkout.userId !== ownerId ||
        order.userId !== ownerId || checkout.status !== 'completed' ||
        order.stripeSessionId !== payment.id || !order.orderId ||
        ['cancelled', 'refunded', 'partially_refunded'].includes(order.status) ||
        validateCheckoutPayment(payment, checkout)) return null;

    const items = checkout.items.map(item => ({
        // Same product identifier as lib/seo/merchantFeed.js. Do not send notes,
        // custom request names, contact fields, private assets or sourceCart.
        item_id: String(item.productId || ''),
        price: item.unitAmount / 100,
        quantity: item.quantity,
    }));
    if (items.some(item => !item.item_id)) return null;
    const productCents = checkout.items.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);
    const shippingCents = checkout.items.reduce((sum, item) => sum + item.deliveryAmount, 0);
    return {
        transaction_id: order.orderId,
        value: productCents / 100,
        shipping: shippingCents / 100,
        currency: checkout.currency.toUpperCase(),
        items,
    };
}

function validCalendarDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
        new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}

export function buildGoogleReviewOptIn({ ownerId, payment, checkout, order, deliveryEstimate, policy } = {}) {
    if (policy?.enabled !== true || policy.agreementApproved !== true ||
        policy.privacyNoticeApproved !== true || policy.transactionSharingApproved !== true ||
        !Number.isSafeInteger(policy.merchantId) || policy.merchantId < 1 ||
        !buildGooglePurchase({ ownerId, payment, checkout, order })) return null;
    if (order.status === 'on_hold') return null;
    // This future input must come from an approved order-specific fulfilment
    // source. Never derive a date from today's date or generic feed timings.
    if (deliveryEstimate?.orderId !== order.orderId || !deliveryEstimate.source ||
        !validCalendarDate(deliveryEstimate.date)) return null;
    const country = isoCountryCode(order.shippingAddress?.country);
    if (!country) return null;
    const email = String(order.customerEmail || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    return {
        merchant_id: policy.merchantId,
        order_id: order.orderId,
        email,
        delivery_country: country,
        estimated_delivery_date: deliveryEstimate.date,
    };
}
