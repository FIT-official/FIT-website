import { NextResponse } from 'next/server';
import { getCreatorStripe, getPlanForPriceId, isPriceValidForPlan } from '@/lib/creatorEntitlements';

export async function GET(req) {
    const priceId = new URL(req.url).searchParams.get('priceId');
    const plan = getPlanForPriceId(priceId);
    if (!plan) return NextResponse.json({ error: 'Unknown subscription plan' }, { status: 400 });
    try {
        const price = await getCreatorStripe().prices.retrieve(priceId, { expand: ['product'] });
        if (!isPriceValidForPlan(price, plan)) {
            return NextResponse.json({ error: 'This plan is not available for payment.' }, { status: 503 });
        }
        return NextResponse.json({
            planId: plan.id, productName: plan.name, price: plan.amount.toFixed(2),
            currency: plan.currency, interval: plan.interval,
            description: `${plan.limits.products} listings and ${plan.limits.monthlyPrintRequests} customer print requests per month.`,
            features: plan.features.map(name => ({ name })), limits: plan.limits,
        });
    } catch (error) {
        console.error('Subscription catalogue unavailable:', error?.code || error?.type || 'provider_error');
        return NextResponse.json({ error: 'Subscription information is temporarily unavailable.' }, { status: 503 });
    }
}
