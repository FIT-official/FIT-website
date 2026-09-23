import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { getCreatorStripe, subscriptionBelongsToUser, subscriptionMetadata } from '@/lib/creatorEntitlements';

const subscriptionEvents = new Set([
    'customer.subscription.created', 'customer.subscription.updated',
    'customer.subscription.deleted', 'customer.subscription.pending_update_applied',
    'customer.subscription.pending_update_expired',
]);

export async function POST(req) {
    let stripe;
    let event;
    try {
        stripe = getCreatorStripe();
        const secret = process.env.STRIPE_SUBSCRIPTION_SIGNING_SECRET || process.env.STRIPE_DELETE_SUBSCRIPTION_SIGNING_SECRET;
        if (!secret) return NextResponse.json({ error: 'Subscription webhook is not configured.' }, { status: 503 });
        event = stripe.webhooks.constructEvent(await req.text(), req.headers.get('stripe-signature'), secret);
    } catch (error) {
        console.error('Subscription webhook verification failed:', error?.type || 'invalid_signature');
        return NextResponse.json({ error: 'Webhook verification failed' }, { status: 400 });
    }
    if (!subscriptionEvents.has(event.type)) return NextResponse.json({ received: true });
    try {
        const incoming = event.data.object;
        const customerId = typeof incoming.customer === 'string' ? incoming.customer : incoming.customer?.id;
        const client = await clerkClient();
        let target = null;
        let customer = null;
        // New subscriptions have an explicit Clerk owner; legacy records can be
        // located by email, but never authorised by email or customer ID alone.
        if (incoming.metadata?.clerkUserId) {
            try { target = await client.users.getUser(incoming.metadata.clerkUserId); }
            catch (error) { if (error.status !== 404) throw error; }
        }
        if (!target && customerId) {
            customer = await stripe.customers.retrieve(customerId);
            if (!customer.deleted && customer.metadata?.clerkUserId) {
                try { target = await client.users.getUser(customer.metadata.clerkUserId); }
                catch (error) { if (error.status !== 404) throw error; }
            }
            if (!target && !customer.deleted && customer.email) {
                const { data } = await client.users.getUserList({ emailAddress: [customer.email], limit: 100 });
                target = data.find(user => user.publicMetadata?.stripeSubscriptionId === incoming.id &&
                    subscriptionBelongsToUser(incoming, user)) || null;
            }
        }
        if (!target) return NextResponse.json({ received: true, matched: false });
        // Re-read before writing: a cancellation from a replaced subscription
        // cannot revoke the replacement, even when the customer is identical.
        const latestUser = await client.users.getUser(target.id);
        if (latestUser.publicMetadata?.stripeSubscriptionId !== incoming.id ||
            !subscriptionBelongsToUser(incoming, latestUser)) {
            return NextResponse.json({ received: true, matched: false });
        }
        const deleted = event.type === 'customer.subscription.deleted';
        // Live retrieval makes out-of-order update deliveries converge on Stripe.
        const current = deleted ? incoming : await stripe.subscriptions.retrieve(incoming.id);
        if (!subscriptionBelongsToUser(current, latestUser)) {
            return NextResponse.json({ received: true, matched: false });
        }
        const writeUser = await client.users.getUser(target.id);
        if (writeUser.publicMetadata?.stripeSubscriptionId !== incoming.id ||
            !subscriptionBelongsToUser(current, writeUser)) {
            return NextResponse.json({ received: true, matched: false });
        }
        const currentMetadata = subscriptionMetadata(current);
        const metadata = deleted
            ? { stripeSubscriptionId: null, stripeSubscriptionStatus: 'canceled', creatorPlanId: 'free' }
            : { stripeSubscriptionStatus: currentMetadata.stripeSubscriptionStatus, creatorPlanId: currentMetadata.creatorPlanId };
        // Patch only billing facts. Never copy a read-back role or subscription
        // ID over a replacement saved while this update was in flight.
        await client.users.updateUserMetadata(writeUser.id, { publicMetadata: metadata });
        return NextResponse.json({ received: true, matched: true });
    } catch (error) {
        console.error('Subscription webhook processing failed:', error?.code || error?.type || 'provider_error');
        // Provider outages are retryable; acknowledging them would lose updates.
        return NextResponse.json({ error: 'Unable to process subscription event' }, { status: 500 });
    }
}
