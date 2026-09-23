import Stripe from 'stripe';
import { clerkClient } from '@clerk/nextjs/server';
import { getCreatorPlan, getCreatorBillingPlan } from './creatorPlans';
import { getConfiguredCreatorPriceIds } from './stripeConfig';
import { getLegacyCreatorPlan } from './legacyCreatorPlans';
import { effectiveCreatorPlan } from './creatorAccess';

export function getCreatorPriceIds() {
    return getConfiguredCreatorPriceIds();
}

export function getCreatorStripe() {
    if (!process.env.STRIPE_SECRET_KEY) {
        throw Object.assign(new Error('Subscription payments are not configured.'), { status: 503 });
    }
    // Keep the PaymentIntent contract explicit while the existing Elements UI is used.
    return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
}

export function getPlanForPriceId(priceId) {
    if (!priceId || typeof priceId !== 'string') return null;
    const matches = Object.entries(getCreatorPriceIds()).filter(([, id]) => id === priceId);
    // A duplicate environment mapping is a configuration error, never an upgrade.
    if (matches.length !== 1) return null;
    const key = matches[0][0];
    return getCreatorBillingPlan(key.replace(/Yearly$/, ''), key.endsWith('Yearly') ? 'year' : 'month');
}

export function isPriceValidForPlan(price, plan) {
    return Boolean(plan && plan.amount > 0 && price?.active &&
        price.currency?.toUpperCase() === plan.currency &&
        price.unit_amount === plan.amount * 100 &&
        price.recurring?.interval === plan.interval &&
        price.recurring.interval_count === 1 &&
        price.recurring.usage_type === 'licensed' &&
        !price.transform_quantity &&
        (!price.billing_scheme || price.billing_scheme === 'per_unit') &&
        (!price.product || typeof price.product === 'string' ||
            (!price.product.deleted && price.product.active !== false)));
}

export function getPlanForSubscription(subscription) {
    if (!['active', 'trialing'].includes(subscription?.status)) return getCreatorPlan('free');
    const items = subscription.items?.data || [];
    if (items.length !== 1) return getCreatorPlan('free');
    const price = items[0].price;
    const priceId = typeof price === 'string' ? price : price?.id;
    const plan = getLegacyCreatorPlan(priceId) || getPlanForPriceId(priceId);
    // Archived prices remain valid for existing subscribers, but a mistyped env
    // mapping must not grant paid capacity for the wrong currency or amount.
    const existingPrice = typeof price === 'object' && price ? { ...price, active: true, product: undefined } : null;
    return plan && (items[0].quantity ?? 1) === 1 && isPriceValidForPlan(existingPrice, plan)
        ? plan : getCreatorPlan('free');
}

export function subscriptionBelongsToUser(subscription, user) {
    const customerId = typeof subscription?.customer === 'string'
        ? subscription.customer : subscription?.customer?.id;
    return Boolean(customerId && customerId === user?.publicMetadata?.stripeCustomerId &&
        (!subscription.metadata?.clerkUserId || subscription.metadata.clerkUserId === user.id));
}

export function subscriptionMetadata(subscription) {
    return {
        stripeSubscriptionId: subscription?.id || null,
        stripeSubscriptionStatus: subscription?.status || 'free',
        creatorPlanId: getPlanForSubscription(subscription).id,
    };
}

export async function getCreatorEntitlementsForUser(user) {
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
    let subscription = null;
    let status = 'free';
    const subscriptionId = user.publicMetadata?.stripeSubscriptionId;
    if (subscriptionId && !process.env.STRIPE_SECRET_KEY) status = 'unavailable';
    if (subscriptionId && process.env.STRIPE_SECRET_KEY) {
        try {
            const current = await getCreatorStripe().subscriptions.retrieve(subscriptionId);
            if (subscriptionBelongsToUser(current, user)) {
                subscription = current;
                status = current.status;
            }
        } catch (error) {
            // No unverified paid uplift. The valid user's Free storefront remains usable.
            if (error?.code !== 'resource_missing') {
                console.error('Unable to verify creator subscription:', error?.code || error?.type || 'provider_error');
                status = 'unavailable';
            }
        }
    }
    const access = effectiveCreatorPlan(user, getPlanForSubscription(subscription), status);
    return { ...access, planId: access.plan.id, isAdmin: user.publicMetadata?.role === 'admin', subscription };
}

export async function getCreatorEntitlements(userId) {
    if (!userId) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    const client = await clerkClient();
    return getCreatorEntitlementsForUser(await client.users.getUser(userId));
}
