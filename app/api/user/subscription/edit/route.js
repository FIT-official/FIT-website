import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
    getCreatorStripe, getPlanForPriceId, getPlanForSubscription,
    isPriceValidForPlan, subscriptionBelongsToUser, subscriptionMetadata,
} from '@/lib/creatorEntitlements';

function subscriptionPriceId(subscription) {
    const price = subscription?.items?.data?.[0]?.price;
    return typeof price === 'string' ? price : price?.id;
}

function matchesRequestedPlan(subscription, requestedPlan, requestedPriceId) {
    const plan = getPlanForSubscription(subscription);
    return ['active', 'trialing'].includes(subscription.status) && !subscription.pending_update &&
        subscriptionPriceId(subscription) === requestedPriceId &&
        plan.id === requestedPlan.id && plan.interval === requestedPlan.interval;
}

function resultFor(subscription, requestedPlan, requestedPriceId) {
    const intent = subscription.latest_invoice?.payment_intent;
    const plan = getPlanForSubscription(subscription);
    const success = matchesRequestedPlan(subscription, requestedPlan, requestedPriceId);
    const requiresAction = !success && ['requires_action', 'requires_confirmation'].includes(intent?.status);
    return {
        success, subscriptionId: subscription.id, status: subscription.status,
        planId: plan.id, interval: plan.interval, priceId: subscriptionPriceId(subscription) || null,
        pending_update: Boolean(subscription.pending_update),
        requires_action: requiresAction,
        clientSecret: requiresAction ? intent.client_secret : null,
        ...(!success ? { error: requiresAction
            ? 'Confirm the payment to activate your plan.'
            : 'Payment is not complete. Your previous plan remains in effect. Check your card or billing status before retrying.' } : {}),
    };
}

export async function POST(req) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        let body = {};
        if (req.headers.get('content-type')?.includes('application/json')) {
            try { body = await req.json(); }
            catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }
        }
        // Legacy selections in unsafe metadata are untrusted, just like request bodies.
        const priceId = body.priceId ?? user.unsafeMetadata?.priceId;
        const cardToken = body.cardToken ?? user.unsafeMetadata?.cardToken;
        const prorationDate = body.prorationDate;
        const requestedPlan = getPlanForPriceId(priceId);
        if (!requestedPlan) return NextResponse.json({ error: 'Choose an available Standard or Pro plan.' }, { status: 400 });
        const stripe = getCreatorStripe();
        const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
        if (!isPriceValidForPlan(price, requestedPlan)) {
            return NextResponse.json({ error: 'This plan is not ready for payment. Please contact support.' }, { status: 503 });
        }

        const originalSubscriptionId = user.publicMetadata?.stripeSubscriptionId;
        let creationPredecessor = originalSubscriptionId || 'first';
        let customerId = user.publicMetadata?.stripeCustomerId;
        let subscription = null;
        if (originalSubscriptionId) {
            try {
                subscription = await stripe.subscriptions.retrieve(originalSubscriptionId, { expand: ['latest_invoice.payment_intent'] });
            } catch (error) {
                if (error?.code !== 'resource_missing') throw error;
            }
            if (subscription && !subscriptionBelongsToUser(subscription, user)) {
                return NextResponse.json({ error: 'Subscription ownership could not be verified.' }, { status: 403 });
            }
            if (['canceled', 'incomplete_expired'].includes(subscription?.status)) subscription = null;
        }
        if (!subscription && customerId) {
            // Recover a creation that reached Stripe before its Clerk metadata save.
            const existing = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100, expand: ['data.latest_invoice.payment_intent'] });
            const current = existing.data.filter(item => !['canceled', 'incomplete_expired'].includes(item.status));
            if (!originalSubscriptionId && existing.data.length) {
                creationPredecessor = [...existing.data].sort((a, b) => (b.created || 0) - (a.created || 0))[0].id;
            }
            if (current.length > 1 || existing.has_more) {
                return NextResponse.json({ error: 'Please contact support to review your existing subscriptions.' }, { status: 409 });
            }
            if (current[0]) {
                if (!subscriptionBelongsToUser(current[0], user)) {
                    return NextResponse.json({ error: 'Subscription ownership could not be verified.' }, { status: 403 });
                }
                subscription = current[0];
            }
        }

        const saveSubscription = async (current) => {
            const latest = await client.users.getUser(userId);
            const savedId = latest.publicMetadata?.stripeSubscriptionId;
            if (savedId && savedId !== originalSubscriptionId && savedId !== current.id) {
                throw Object.assign(new Error('Your subscription changed in another session. Refresh the page.'), { status: 409 });
            }
            await client.users.updateUser(userId, {
                publicMetadata: { ...latest.publicMetadata, stripeCustomerId: customerId, ...subscriptionMetadata(current) },
                unsafeMetadata: { ...latest.unsafeMetadata, cardToken: null, priceId: null },
            });
        };

        const unfinishedPayment = Boolean(subscription?.pending_update || subscription?.status === 'incomplete');
        const unfinishedPrice = subscription?.pending_update?.subscription_items?.[0]?.price || subscriptionPriceId(subscription);
        if (unfinishedPayment && (typeof unfinishedPrice === 'string' ? unfinishedPrice : unfinishedPrice?.id) !== priceId) {
            return NextResponse.json({ success: false, error: 'Complete the pending plan payment before selecting a different plan.' }, { status: 409 });
        }
        const replacingDeclinedCard = unfinishedPayment &&
            subscription.latest_invoice?.payment_intent?.status === 'requires_payment_method';
        if (unfinishedPayment && !replacingDeclinedCard) {
            await saveSubscription(subscription);
            return NextResponse.json(resultFor(subscription, requestedPlan, priceId));
        }
        if (subscription && !unfinishedPayment && !['active', 'trialing'].includes(subscription.status)) {
            return NextResponse.json({ success: false, status: subscription.status, error: 'Resolve the existing subscription payment before changing plans.' }, { status: 409 });
        }
        if (subscription && !unfinishedPayment && matchesRequestedPlan(subscription, requestedPlan, priceId)) {
            await saveSubscription(subscription);
            return NextResponse.json(resultFor(subscription, requestedPlan, priceId));
        }
        if (subscription && prorationDate !== undefined && (!Number.isSafeInteger(prorationDate) ||
            prorationDate > Math.floor(Date.now() / 1000) || prorationDate < Math.floor(Date.now() / 1000) - 300)) {
            return NextResponse.json({ error: 'Upgrade amount expired. Please refresh the preview.' }, { status: 409 });
        }
        if (typeof cardToken !== 'string' || !/^tok_[A-Za-z0-9_]{1,220}$/.test(cardToken)) {
            return NextResponse.json({ error: 'Valid card details are required.' }, { status: 400 });
        }
        if (subscription && subscription.items?.data?.length !== 1) {
            return NextResponse.json({ error: 'Please contact support to change this subscription.' }, { status: 409 });
        }

        // Validate the selected price and ownership before any payment mutation.
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.emailAddresses?.[0]?.emailAddress,
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
                metadata: { clerkUserId: userId },
            }, { idempotencyKey: `fit-customer:${userId}` });
            customerId = customer.id;
            const latest = await client.users.getUser(userId);
            await client.users.updateUser(userId, { publicMetadata: { ...latest.publicMetadata, stripeCustomerId: customerId } });
        }
        const paymentMethod = await stripe.paymentMethods.create({ type: 'card', card: { token: cardToken } },
            { idempotencyKey: `fit-card:${userId}:${cardToken}` });
        await stripe.paymentMethods.attach(paymentMethod.id, { customer: customerId });
        await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethod.id } });
        if (replacingDeclinedCard) {
            await stripe.subscriptions.update(subscription.id, { default_payment_method: paymentMethod.id });
            await stripe.paymentIntents.update(subscription.latest_invoice.payment_intent.id, { payment_method: paymentMethod.id });
            subscription = await stripe.subscriptions.retrieve(subscription.id, { expand: ['latest_invoice.payment_intent'] });
            await saveSubscription(subscription);
            return NextResponse.json(resultFor(subscription, requestedPlan, priceId));
        }
        if (subscription) {
            await stripe.subscriptions.update(subscription.id, { default_payment_method: paymentMethod.id });
            subscription = await stripe.subscriptions.update(subscription.id, {
                items: [{ id: subscription.items.data[0].id, price: priceId, quantity: 1 }],
                proration_behavior: 'always_invoice', payment_behavior: 'pending_if_incomplete',
                ...(prorationDate !== undefined ? { proration_date: prorationDate } : {}),
                expand: ['latest_invoice.payment_intent'],
            }, { idempotencyKey: `fit-plan:${userId}:${cardToken}` });
        } else {
            subscription = await stripe.subscriptions.create({
                customer: customerId, items: [{ price: priceId, quantity: 1 }],
                default_payment_method: paymentMethod.id,
                payment_behavior: 'default_incomplete',
                payment_settings: { save_default_payment_method: 'on_subscription' },
                metadata: { clerkUserId: userId },
                expand: ['latest_invoice.payment_intent'],
            // Concurrent submissions with different card tokens share one key.
            // The prior subscription distinguishes a later, intentional restart.
            }, { idempotencyKey: `fit-subscription:${userId}:${customerId}:${creationPredecessor}` });
        }
        await saveSubscription(subscription);
        return NextResponse.json(resultFor(subscription, requestedPlan, priceId));
    } catch (error) {
        console.error('Subscription update failed:', error?.code || error?.type || 'provider_error');
        const status = error.status || (error.type === 'StripeCardError' ? 402 : 500);
        return NextResponse.json({ success: false, error: status === 500
            ? 'Unable to update your subscription. Please retry or contact support.' : error.message }, { status });
    }
}
