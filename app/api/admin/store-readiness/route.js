import { NextResponse } from 'next/server';
import { authenticate, UnauthorizedError } from '@/lib/authenticate';
import { checkAdminPrivileges } from '@/lib/checkPrivileges';
import { connectToDatabase } from '@/lib/db';
import { verifyCheckoutTransactions } from '@/lib/checkoutTransactionReadiness';
import { CREATOR_BILLING_PLANS } from '@/lib/creatorPlans';
import { getConfiguredCreatorPriceIds } from '@/lib/stripeConfig';
import { getCreatorStripe, getPlanForPriceId, isPriceValidForPlan } from '@/lib/creatorEntitlements';
import { privateFabricationBucket } from '@/lib/fabrication/serverAssets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const response = (body, status = 200) => NextResponse.json(body, {
    status, headers: { 'Cache-Control': 'private, no-store' },
});
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
    if (!process.env.FABRICATION_S3_BUCKET_NAME) return result(false, 'fabrication_storage_not_configured');
    try {
        await privateFabricationBucket();
        return result(true, 'ready');
    } catch { return result(false, 'fabrication_storage_unverified'); }
}

export async function GET(req) {
    try {
        const { userId } = await authenticate(req);
        if (!await checkAdminPrivileges(userId)) return response(result(false, 'forbidden'), 403);
    } catch (error) {
        return error instanceof UnauthorizedError
            ? response(result(false, 'unauthorized'), 401)
            : response(result(false, 'authorization_unavailable'), 503);
    }
    // Each probe is read-only. Never return provider errors, IDs, documents or URLs.
    const [checkoutTransactions, subscriptionPrices, fabricationStorage] = await Promise.all([
        checkoutReadiness(), priceReadiness(), fabricationReadiness(),
    ]);
    const ready = checkoutTransactions.ready && fabricationStorage.ready &&
        Object.values(subscriptionPrices).every(price => price.ready);
    return response({ ready, checkoutTransactions, subscriptionPrices, fabricationStorage });
}
