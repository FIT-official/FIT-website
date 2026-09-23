import CheckoutSession from '@/models/CheckoutSession';
import Order from '@/models/Order';
import User from '@/models/User';

const fail = message => { throw Object.assign(new Error(message), { status: 409 }); };

export function isLegacyCheckout(checkout) {
    return Boolean(checkout) && checkout.snapshotVersion == null &&
        (checkout.items == null || (Array.isArray(checkout.items) && checkout.items.length === 0));
}

/** This receipt proves payment only. Legacy line data cannot authorize fulfilment. */
export function buildLegacyCheckoutReceipt(event, checkout, now = new Date()) {
    const payment = event?.data?.object;
    if (!isLegacyCheckout(checkout)) fail('This checkout is not an eligible legacy payment');
    if (!payment?.id || payment.id !== checkout.sessionId) fail('Payment session does not match checkout');
    if (payment.mode !== 'payment' || payment.payment_status !== 'paid') fail('Payment is not paid');
    if (!checkout.userId || payment.metadata?.userId !== checkout.userId) fail('Payment owner does not match checkout');
    if (!Number.isSafeInteger(payment.amount_total) || payment.amount_total < 0 ||
        typeof payment.currency !== 'string' || !/^[a-z]{3}$/.test(payment.currency)) fail('Payment amount or currency is invalid');
    const eventCreatedAt = new Date(event.created * 1000);
    if (typeof event.id !== 'string' || !/^evt_[A-Za-z0-9_]{1,250}$/.test(event.id) ||
        !Number.isSafeInteger(event.created) || event.created < 0 || !Number.isFinite(eventCreatedAt.getTime()) ||
        !(now instanceof Date) || !Number.isFinite(now.getTime())) fail('Payment event identity or timestamp is invalid');
    const paymentIntentId = typeof payment.payment_intent === 'string' ? payment.payment_intent : payment.payment_intent?.id || null;
    if (paymentIntentId !== null && (typeof paymentIntentId !== 'string' || !/^pi_[A-Za-z0-9_]{1,250}$/.test(paymentIntentId))) {
        fail('Payment intent identity is invalid');
    }
    const expectedAmountCents = Number.isFinite(checkout.totalAmount) ? checkout.totalAmount : null;
    const expectedCurrency = typeof checkout.currency === 'string' ? checkout.currency.toLowerCase() : null;
    return {
        reason: 'legacy_snapshot_missing', paymentStatus: 'paid', amountTotalCents: payment.amount_total,
        currency: payment.currency, paymentIntentId, stripeEventId: event.id,
        recordedAt: now, eventCreatedAt, expectedAmountCents, expectedCurrency,
        amountMismatch: expectedAmountCents !== payment.amount_total, currencyMismatch: expectedCurrency !== payment.currency,
    };
}

function samePayment(receipt, expected) {
    return receipt?.reason === expected.reason && receipt.paymentStatus === 'paid' &&
        receipt.amountTotalCents === expected.amountTotalCents && receipt.currency === expected.currency &&
        (receipt.paymentIntentId || null) === expected.paymentIntentId;
}

export async function recordLegacyCheckoutPayment(event, checkout) {
    const receipt = buildLegacyCheckoutReceipt(event, checkout);
    if (checkout.reconciliation) {
        if (!samePayment(checkout.reconciliation, receipt)) fail('Payment conflicts with the recorded reconciliation receipt');
        return { received: true, reconciliationRequired: true, duplicate: true };
    }
    // `processed` was also an admin toggle. Only a persisted purchase record
    // can distinguish historical fulfilment from an unfulfilled flagged session.
    const [order, history] = await Promise.all([
        Order.exists({ stripeSessionId: checkout.sessionId, userId: checkout.userId }),
        User.exists({ userId: checkout.userId, 'orderHistory.stripeSessionId': checkout.sessionId }),
    ]);
    if (order || history) return { received: true, duplicate: true, legacyOrderExists: true };

    const result = await CheckoutSession.updateOne({
        sessionId: checkout.sessionId, userId: checkout.userId,
        snapshotVersion: null, reconciliation: null, status: { $ne: 'completed' },
        $or: [{ items: null }, { items: { $size: 0 } }],
    }, { $set: { status: 'reconciliation_required', reconciliation: receipt } }, {
        runValidators: true, writeConcern: { w: 'majority' },
        // Mongoose otherwise strips immutable fields even on their first write
        // to an existing document. The null predicate makes this write-once.
        overwriteImmutable: true,
    });
    if (result.matchedCount === 1) return { received: true, reconciliationRequired: true };

    const current = await CheckoutSession.findOne({ sessionId: checkout.sessionId, userId: checkout.userId });
    if (current?.status === 'completed') return { received: true, duplicate: true };
    if (current?.reconciliation && samePayment(current.reconciliation, receipt)) {
        return { received: true, reconciliationRequired: true, duplicate: true };
    }
    fail('Checkout changed before its payment receipt could be recorded; retry for reconciliation');
}
