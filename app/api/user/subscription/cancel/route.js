import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getCreatorStripe, subscriptionBelongsToUser, subscriptionMetadata } from '@/lib/creatorEntitlements';

export async function POST() {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        const subscriptionId = user.publicMetadata?.stripeSubscriptionId;
        if (!subscriptionId) return NextResponse.json({ error: 'No paid subscription found' }, { status: 404 });
        const stripe = getCreatorStripe();
        const current = await stripe.subscriptions.retrieve(subscriptionId);
        if (!subscriptionBelongsToUser(current, user)) {
            return NextResponse.json({ error: 'Subscription ownership could not be verified.' }, { status: 403 });
        }
        if (['canceled', 'incomplete_expired'].includes(current.status)) {
            return NextResponse.json({ error: 'This subscription has already ended.' }, { status: 409 });
        }
        const subscription = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
        const latest = await client.users.getUser(userId);
        if (latest.publicMetadata?.stripeSubscriptionId === subscriptionId) {
            await client.users.updateUser(userId, { publicMetadata: {
                ...latest.publicMetadata, ...subscriptionMetadata(subscription),
            } });
        }
        return NextResponse.json({
            success: true, message: 'Cancellation scheduled for the end of the billing period.',
            cancel_at_period_end: true,
            current_period_end: subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end ?? null,
        });
    } catch (error) {
        console.error('Subscription cancellation failed:', error?.code || error?.type || 'provider_error');
        return NextResponse.json({ error: 'Unable to schedule cancellation. Please retry or contact support.' }, { status: error.status || 500 });
    }
}
