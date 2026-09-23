import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getCreatorStripe, getPlanForPriceId, isPriceValidForPlan, subscriptionBelongsToUser } from '@/lib/creatorEntitlements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const priceId = new URL(request.url).searchParams.get('priceId');
        const plan = getPlanForPriceId(priceId);
        if (!plan) return NextResponse.json({ error: 'Choose an available paid plan.' }, { status: 400 });
        const user = await (await clerkClient()).users.getUser(userId);
        const subscriptionId = user?.publicMetadata?.stripeSubscriptionId;
        if (!subscriptionId) return NextResponse.json({ error: 'No current paid subscription.' }, { status: 404 });
        const stripe = getCreatorStripe();
        const [subscription, price] = await Promise.all([
            stripe.subscriptions.retrieve(subscriptionId),
            stripe.prices.retrieve(priceId, { expand: ['product'] }),
        ]);
        if (!subscriptionBelongsToUser(subscription, user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        if (!['active', 'trialing'].includes(subscription.status) || subscription.pending_update || subscription.items?.data?.length !== 1) {
            return NextResponse.json({ error: 'Resolve your current billing before changing plans.' }, { status: 409 });
        }
        if (!isPriceValidForPlan(price, plan)) return NextResponse.json({ error: 'This plan is not ready for payment.' }, { status: 503 });
        const item = subscription.items.data[0];
        const currentPriceId = typeof item.price === 'string' ? item.price : item.price?.id;
        if (currentPriceId === priceId) return NextResponse.json({ error: 'This is already your plan.' }, { status: 400 });
        const prorationDate = Math.floor(Date.now() / 1000);
        const preview = await stripe.invoices.createPreview({
            customer: user.publicMetadata.stripeCustomerId,
            subscription: subscription.id,
            subscription_details: {
                items: [{ id: item.id, price: priceId, quantity: 1 }],
                proration_behavior: 'always_invoice',
                proration_date: prorationDate,
            },
        });
        return NextResponse.json({ amountDue: preview.amount_due, currency: preview.currency?.toUpperCase() || 'SGD', prorationDate, priceId }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        console.error('Subscription preview failed:', error?.code || error?.type || 'provider_error');
        return NextResponse.json({ error: 'Unable to show the upgrade amount. Please try again.' }, { status: 503 });
    }
}
