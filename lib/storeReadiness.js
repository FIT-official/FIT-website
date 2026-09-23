import { connectToDatabase } from '@/lib/db';
import { verifyCheckoutTransactions } from '@/lib/checkoutTransactionReadiness';
import { CREATOR_BILLING_PLANS } from '@/lib/creatorPlans';
import { getConfiguredCreatorPriceIds } from '@/lib/stripeConfig';
import { getCreatorStripe, getPlanForPriceId, isPriceValidForPlan } from '@/lib/creatorEntitlements';
import { privateFabricationBucket } from '@/lib/fabrication/serverAssets';

const result = (ready, code) => ({ ready, code });

async function checkoutReadiness() {
    try {
        const database = await connectToDatabase();
        await verifyCheckoutTransactions(database, { force: true });
        return result(true, 'ready');
    } catch { return result(false, 'checkout_transaction_unavailable'); }
}

async function priceReadiness() {
    const ids = getConfiguredCreatorPriceIds();
    let stripe;
    try { stripe = getCreatorStripe(); } catch { /* Report configured variants separately below. */ }
    const checks = await Promise.all(CREATOR_BILLING_PLANS.filter(plan => plan.id !== 'free').map(async plan => {
        const key = `${plan.id}${plan.interval === 'year' ? 'Yearly' : ''}`;
        const priceId = ids[key];
        if (!priceId) return [key, result(false, 'price_not_configured')];
        const mappedPlan = getPlanForPriceId(priceId);
        if (mappedPlan?.id !== plan.id || mappedPlan.interval !== plan.interval) {
            return [key, result(false, 'price_invalid')];
        }
        if (!stripe) return [key, result(false, 'stripe_not_configured')];
        try {
            const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
            const ready = price.id === priceId && isPriceValidForPlan(price, plan);
            return [key, result(ready, ready ? 'ready' : 'price_invalid')];
        } catch { return [key, result(false, 'price_unavailable')]; }
    }));
    return Object.fromEntries(checks);
}

async function fabricationReadiness() {
    if (!process.env.FABRICATION_S3_BUCKET_NAME?.trim()) return result(false, 'fabrication_storage_not_configured');
    try {
        await privateFabricationBucket();
        return result(true, 'ready');
    } catch { return result(false, 'fabrication_storage_unverified'); }
}

// Call only after an authenticated admin check. These probes do not mutate
// store data and return no provider errors, IDs, documents, secrets or URLs.
export async function getStoreReadiness() {
    const [checkoutTransactions, subscriptionPrices, fabricationStorage] = await Promise.all([
        checkoutReadiness(), priceReadiness(), fabricationReadiness(),
    ]);
    // Presence cannot prove delivery, but a missing verifier must block payment.
    const checkoutWebhook = process.env.STRIPE_SESSION_COMPLETE_SIGNING_SECRET?.trim()
        ? result(true, 'ready') : result(false, 'checkout_webhook_not_configured');
    const ready = checkoutTransactions.ready && checkoutWebhook.ready && fabricationStorage.ready &&
        Object.values(subscriptionPrices).every(price => price.ready);
    return { ready, checkoutTransactions, checkoutWebhook, subscriptionPrices, fabricationStorage };
}
