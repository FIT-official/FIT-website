import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { connectToDatabase } from '@/lib/db';
import User from '@/models/User';
import Product from '@/models/Product';
import CheckoutSession from '@/models/CheckoutSession';
import Order from '@/models/Order';
import CustomPrintRequest from '@/models/CustomPrintRequest';
import DigitalProductTransaction from '@/models/DigitalProductTransaction';
import { checkoutPlain, checkoutOrderItem, validateCheckoutPayment, removePurchasedCartItems } from '@/lib/checkoutSnapshot';
import { sendEmail } from '@/lib/email';
import { buildNewSaleEmail, buildOrderConfirmationEmail } from '@/lib/email/templates/transactional';
import { notifyCustomPrintEvent } from '@/lib/notifications/customPrint';
import { clerkClient } from '@clerk/nextjs/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-05-28.basil' });
const webhookSecret = process.env.STRIPE_SESSION_COMPLETE_SIGNING_SECRET;
export const dynamic = 'force-dynamic';

class FulfilmentError extends Error {
    constructor(message, status = 409) { super(message); this.status = status; }
}

// Stock and its sale entry are committed in the same transaction as the order.
async function recordSaleAndDecrementStock(product, item, userId, dbSession) {
    const filter = { _id: product._id };
    const increments = {};
    const arrayFilters = [];
    if (!product.infiniteStock) {
        if (product.stock != null) {
            filter.stock = { $gte: item.quantity };
            increments.stock = -item.quantity;
        }
        for (const [name, selected] of Object.entries(item.selectedVariants || {})) {
            const type = product.variantTypes?.find(v => v.name === name);
            const option = type?.options?.find(v => v.name === selected);
            if (!option) throw new FulfilmentError('Purchased option is unavailable; payment requires reconciliation');
            if (option.stock != null) {
                const i = arrayFilters.length / 2;
                filter.$and ||= [];
                filter.$and.push({ variantTypes: { $elemMatch: { _id: type._id,
                    options: { $elemMatch: { _id: option._id, stock: { $gte: item.quantity } } } } } });
                increments[`variantTypes.$[type${i}].options.$[option${i}].stock`] = -item.quantity;
                arrayFilters.push({ [`type${i}._id`]: type._id }, { [`option${i}._id`]: option._id });
            }
        }
    }
    const result = await Product.updateOne(filter, {
        ...(Object.keys(increments).length ? { $inc: increments } : {}),
        $push: { sales: { userId, quantity: item.quantity, price: item.totalAmount / item.quantity / 100 } },
    }, { session: dbSession, ...(arrayFilters.length ? { arrayFilters } : {}) });
    if (!result.matchedCount) throw new FulfilmentError('Purchased stock is unavailable; payment requires reconciliation');
}

export async function POST(req) {
    let event;
    try {
        event = stripe.webhooks.constructEvent(await req.text(), req.headers.get('stripe-signature'), webhookSecret);
    } catch {
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
    }
    if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
        return NextResponse.json({ received: true });
    }
    const payment = event.data.object;
    // Completed can precede settlement for asynchronous payment methods.
    if (payment.payment_status !== 'paid') return NextResponse.json({ received: true, awaitingPayment: true });
    let dbSession;
    try {
        const database = await connectToDatabase();
        const checkout = await CheckoutSession.findOne({ sessionId: payment.id });
        if (!checkout) return NextResponse.json({ error: 'Checkout session not found' }, { status: 404 });
        if (checkout.status === 'completed' || (checkout.snapshotVersion !== 1 && checkout.processed)) {
            return NextResponse.json({ received: true, duplicate: true });
        }
        const invalid = validateCheckoutPayment(payment, checkout);
        if (invalid) return NextResponse.json({ error: invalid, reconciliationRequired: true }, { status: 409 });

        let paymentMethod = null;
        if (payment.payment_intent) {
            try {
                const intent = await stripe.paymentIntents.retrieve(payment.payment_intent, { expand: ['latest_charge'] });
                const method = intent.latest_charge?.payment_method_details;
                if (method) paymentMethod = { type: method.type, brand: method.card?.brand || method.type,
                    last4: method.card?.last4 || null, expiryMonth: method.card?.exp_month || null, expiryYear: method.card?.exp_year || null };
            } catch (error) { console.error('Payment method lookup failed:', error); }
        }

        // No nontransactional fallback: partial fulfilment followed by a retry
        // would otherwise grant assets or decrement inventory more than once.
        dbSession = await database.startSession();
        let duplicate = false;
        let notifications = [];
        let orderItems = [];
        await dbSession.withTransaction(async () => {
            notifications = [];
            const claimed = await CheckoutSession.findOneAndUpdate({ sessionId: payment.id,
                status: { $ne: 'completed' } },
                // Completed becomes visible only when this transaction commits.
                // `processed` is a separate admin review flag, not proof of fulfilment.
                { $set: { status: 'completed' } }, { new: true, session: dbSession });
            if (!claimed) { duplicate = true; return; }
            // Check the actual claimed record as well, inside the transaction.
            const error = validateCheckoutPayment(payment, claimed);
            if (error) throw new FulfilmentError(error);
            const user = await User.findOne({ userId: claimed.userId }).session(dbSession);
            if (!user) throw new FulfilmentError('Checkout owner no longer exists; payment requires reconciliation', 404);
            const snapshots = checkoutPlain(claimed.items);
            orderItems = snapshots.map(checkoutOrderItem);
            for (const item of snapshots) {
                if (item.requestId) {
                    const request = await CustomPrintRequest.findOne({ requestId: item.requestId, userId: claimed.userId }).session(dbSession);
                    if (!request || !['quoted', 'payment_pending'].includes(request.status)) {
                        throw new FulfilmentError('Print request is not payable or was already paid; payment requires reconciliation');
                    }
                    Object.assign(request, item.customRequest, { status: 'paid', stripeSessionId: payment.id,
                        stripePaymentIntentId: payment.payment_intent, paidAt: new Date() });
                    request.statusHistory.push({ status: 'paid', note: 'Payment completed via Stripe checkout' });
                    await request.save({ session: dbSession });
                    notifications.push({ request: checkoutPlain(request), item });
                } else {
                    const product = await Product.findById(item.productId).session(dbSession);
                    if (!product) throw new FulfilmentError('Purchased product no longer exists; payment requires reconciliation');
                    await recordSaleAndDecrementStock(product, item, claimed.userId, dbSession);
                    if (item.productPrintInput) {
                        // The print queue has one model per request, so preserve
                        // purchased quantity with one job per physical unit.
                        for (let unit = 0; unit < item.quantity; unit++) {
                            const [request] = await CustomPrintRequest.create([{
                                ...item.productPrintInput,
                                requestId: `${payment.id}-${item.cartItemId}-${unit}`,
                                basePrice: item.unitAmount / 100, currency: item.currency,
                                status: 'paid', paidAt: new Date(), stripeSessionId: payment.id,
                                stripePaymentIntentId: payment.payment_intent,
                                statusHistory: [{ status: 'paid', note: 'Product print purchased via Stripe' }],
                            }], { session: dbSession });
                            notifications.push({ request: checkoutPlain(request), item: {
                                ...item, deliveryAmount: unit === 0 ? item.deliveryAmount : 0,
                                totalAmount: item.unitAmount + (unit === 0 ? item.deliveryAmount : 0),
                            } });
                        }
                    }
                }
                if (item.paidAssets.length) {
                    await DigitalProductTransaction.updateOne({ userId: claimed.userId, productId: item.productId,
                        sessionId: payment.id }, { $setOnInsert: { status: 'completed', assets: item.paidAssets } },
                    { upsert: true, session: dbSession });
                }
            }
            const address = claimed.shippingAddress || {};
            const newOrder = new Order({
                orderId: `ORD_${payment.id}`, userId: claimed.userId, stripeSessionId: payment.id,
                stripePaymentIntentId: payment.payment_intent || null, paymentMethod,
                customerEmail: claimed.customerEmail || payment.customer_details?.email,
                customerName: claimed.customerName || '',
                shippingAddress: { line1: address.street || '', line2: address.unitNumber || '', city: address.city || '',
                    state: address.state || '', postalCode: address.postalCode || '', country: address.country || '' },
                items: orderItems,
                subtotal: snapshots.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0) / 100,
                totalDiscount: orderItems.reduce((sum, item) => sum + item.discount * item.quantity, 0),
                totalDelivery: snapshots.reduce((sum, item) => sum + item.deliveryAmount, 0) / 100,
                totalAmount: claimed.totalAmount / 100, currency: claimed.currency.toUpperCase(), status: 'pending',
                statusHistory: [{ status: 'pending', timestamp: new Date(), updatedBy: 'system', note: 'Paid checkout verified against purchase snapshot' }],
                customerNote: orderItems.map(item => item.orderNote).filter(Boolean).join('; '),
            });
            await newOrder.save({ session: dbSession });
            user.orderHistory.push(...orderItems.map(item => ({ cartItem: {
                // Legacy readers multiply this all-in unit price by quantity.
                ...item, price: item.totalPrice / item.quantity,
                deliveryFee: item.deliveryFee / item.quantity,
            }, status: item.chosenDeliveryType === 'digital' ? 'delivered' : 'pending', stripeSessionId: payment.id })));
            // Concurrent user edits conflict with this transaction and cause a
            // fresh read/retry, rather than being overwritten by a stale cart.
            user.cart = removePurchasedCartItems(user.cart, snapshots);
            await user.save({ session: dbSession });
        });
        if (duplicate) return NextResponse.json({ received: true, duplicate: true });

        // These external side effects run only after commit. They are best-effort;
        // a notification outage never rolls back a captured and fulfilled payment.
        for (const { request, item } of notifications) {
            try { await notifyCustomPrintEvent({ event: 'paid', request, product: { creatorUserId: item.creatorUserId },
                breakdown: { amount: item.unitAmount / 100, deliveryFee: item.deliveryAmount / 100,
                    total: item.totalAmount / 100, currency: item.currency.toUpperCase(), chosenDeliveryType: item.chosenDeliveryType } });
            } catch (error) { console.error('Paid print notification failed:', error); }
        }
        try {
            const to = checkout.customerEmail || payment.customer_details?.email;
            if (to) await sendEmail({ to, ...buildOrderConfirmationEmail({ customerName: checkout.customerName || '' }) });
        } catch (error) { console.error('Order confirmation failed:', error); }
        const creatorSales = {};
        for (const item of checkout.items) {
            if (!item.creatorUserId) continue;
            creatorSales[item.creatorUserId] ||= { items: [], total: 0 };
            creatorSales[item.creatorUserId].items.push({ name: item.productName, quantity: item.quantity,
                price: item.unitAmount / 100, currency: item.currency.toUpperCase() });
            creatorSales[item.creatorUserId].total += item.totalAmount / 100;
        }
        for (const [creatorId, sale] of Object.entries(creatorSales)) {
            try {
                const clerk = await clerkClient();
                const creator = await clerk.users.getUser(creatorId);
                const to = creator.emailAddresses?.[0]?.emailAddress;
                if (to) await sendEmail({ to, ...buildNewSaleEmail({ ...sale, currency: checkout.currency.toUpperCase() }) });
            } catch (error) { console.error('Creator sale notification failed:', error); }
        }
        return NextResponse.json({ received: true });
    } catch (error) {
        console.error('Checkout fulfilment failed:', error);
        return NextResponse.json({ error: error instanceof FulfilmentError ? error.message : 'Unable to fulfil payment; retry or reconciliation required',
            reconciliationRequired: true }, { status: error.status || 500 });
    } finally {
        if (dbSession) await dbSession.endSession();
    }
}
