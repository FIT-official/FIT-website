import { randomUUID } from 'node:crypto';
import CheckoutAttempt from '@/models/CheckoutAttempt';
import CheckoutSession from '@/models/CheckoutSession';
import User from '@/models/User';
import { checkoutPlain } from '@/lib/checkoutSnapshot';

export class CheckoutAttemptError extends Error {
    constructor(message, code, status = 409) { super(message); this.code = code; this.status = status; }
}

export async function checkoutIntent(user) {
    if (user.checkoutIntent) return user.checkoutIntent;
    const assigned = await User.findOneAndUpdate({ userId: user.userId,
        $or: [{ checkoutIntent: { $exists: false } }, { checkoutIntent: null }] },
        { $set: { checkoutIntent: randomUUID() } }, { new: true });
    const current = assigned || await User.findOne({ userId: user.userId });
    if (!current?.checkoutIntent) throw new Error('Unable to identify checkout');
    return current.checkoutIntent;
}

function publicCheckout(session, snapshot, attemptId) {
    const paid = session.payment_status === 'paid';
    const pending = session.status === 'complete' && !paid;
    return {
        attemptId, sessionId: session.id, alreadyPaid: paid, pending,
        ...(session.status === 'open' && !paid ? { clientSecret: session.client_secret } : {}),
        cartBreakdown: snapshot.items.map(item => ({
            name: item.productName, quantity: item.quantity, price: item.unitAmount / 100,
            basePrice: item.basePrice, priceBeforeDiscount: item.priceBeforeDiscount,
            variantInfo: item.variantInfo, chosenDeliveryType: item.chosenDeliveryType,
            deliveryFee: item.deliveryAmount / 100, orderNote: item.orderNote,
        })),
        userContact: snapshot.shippingAddress,
    };
}

export async function resumeAttempt(stripe, attempt) {
    let session;
    if (attempt.sessionId) {
        session = await stripe.checkout.sessions.retrieve(attempt.sessionId);
    } else {
        // Stripe can prune keys after 24 hours. Never re-create an unresolved
        // attempt beyond that window: it needs reconciliation, not a new charge.
        if (Date.now() - new Date(attempt.createdAt).getTime() > 23 * 60 * 60 * 1000) {
            throw new CheckoutAttemptError('Payment status needs checking. Please contact FIT before starting another payment.', 'checkout_review_required');
        }
        session = await stripe.checkout.sessions.create(attempt.stripeParams, { idempotencyKey: `fit-checkout-${attempt._id}` });
        await CheckoutAttempt.updateOne({ _id: attempt._id }, { $set: { sessionId: session.id } });
    }
    if (session.status === 'expired') {
        await User.updateOne({ userId: attempt.userId, checkoutIntent: attempt._id }, { $set: { checkoutIntent: randomUUID() } });
        throw new CheckoutAttemptError('This payment session expired. Return to your cart to start again.', 'checkout_expired');
    }
    // Save the exact original purchase contract before exposing payment controls.
    // A lost DB response is recoverable using the same Stripe session and _id.
    await CheckoutSession.updateOne({ sessionId: session.id }, { $setOnInsert: {
        ...attempt.snapshot, sessionId: session.id, attemptId: attempt._id,
    } }, { upsert: true });
    if (session.payment_status === 'paid') {
        const fulfilled = await CheckoutSession.findOne({ sessionId: session.id, status: 'completed' });
        if (fulfilled) await User.updateOne({ userId: attempt.userId, checkoutIntent: attempt._id }, { $set: { checkoutIntent: randomUUID() } });
    }
    if (session.status === 'open' && !session.client_secret) throw new Error('Payment controls unavailable');
    return publicCheckout(session, attempt.snapshot, attempt._id);
}

export async function findAttempt(userId, attemptId) {
    if (!attemptId) return null;
    const attempt = await CheckoutAttempt.findById(attemptId);
    if (attempt && attempt.userId !== userId) throw new CheckoutAttemptError('This checkout belongs to another cart.', 'checkout_owner_mismatch', 403);
    return attempt;
}

export async function createAttempt(stripe, { attemptId, userId, snapshot, stripeParams, sessionId }) {
    let attempt;
    try {
        attempt = await CheckoutAttempt.findOneAndUpdate({ _id: attemptId }, { $setOnInsert: {
            userId, snapshot, stripeParams, ...(sessionId ? { sessionId } : {}),
        } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    } catch (error) {
        if (error.code !== 11000) throw error;
        attempt = await CheckoutAttempt.findById(attemptId);
    }
    if (!attempt || attempt.userId !== userId) throw new Error('Checkout ownership unavailable');
    return resumeAttempt(stripe, attempt);
}

// A session issued before attempt IDs were introduced may still be payable.
// Adopt a single known contract; ambiguity blocks a new payment.
export async function adoptLegacyAttempt(stripe, userId, attemptId) {
    const previous = await CheckoutSession.find({ userId, status: 'pending', attemptId: { $exists: false } }).limit(11);
    if (previous.length > 10) throw new CheckoutAttemptError('Earlier payments need checking. Please contact FIT before starting another payment.', 'checkout_review_required');
    const active = [];
    for (const checkout of previous) {
        const session = await stripe.checkout.sessions.retrieve(checkout.sessionId);
        if (session.status === 'expired') {
            await CheckoutSession.updateOne({ sessionId: checkout.sessionId, status: 'pending' }, { $set: { status: 'failed' } });
        } else active.push(checkout);
    }
    if (!active.length) return null;
    if (active.length !== 1 || active[0].snapshotVersion !== 1 || !active[0].items?.length) {
        throw new CheckoutAttemptError('An earlier payment needs checking. Please contact FIT before starting another payment.', 'checkout_review_required');
    }
    const { sessionId, ...record } = checkoutPlain(active[0]);
    const snapshot = Object.fromEntries(['userId', 'snapshotVersion', 'items', 'totalAmount', 'currency',
        'shippingAddress', 'customerEmail', 'customerName', 'salesData', 'digitalProductData']
        .filter(key => record[key] !== undefined).map(key => [key, record[key]]));
    return createAttempt(stripe, { attemptId, userId, snapshot, stripeParams: {}, sessionId });
}
