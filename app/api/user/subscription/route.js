import Stripe from 'stripe'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export async function GET(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const client = await clerkClient();
        const user = await client.users.getUser(userId);

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        if (!user.publicMetadata.stripeSubscriptionId) {
            return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
        }

        const subscription = await stripe.subscriptions.retrieve(user.publicMetadata.stripeSubscriptionId);

        let isUpdatePending = false;
        if (subscription.pending_update) {
            isUpdatePending = true;
        }

        return NextResponse.json({
            priceId: subscription.items.data[0].price.id,
            status: subscription.status,
            current_period_end: subscription.current_period_end,
            created: subscription.created,
            cancelled_at: subscription.canceled_at,
            price: subscription.items.data[0].price.unit_amount,
            pending_update: isUpdatePending,
            days_until_due: subscription.days_until_due,
            trial_end: subscription.trial_end,
            pending_update_expiry: subscription.pending_update ? subscription.pending_update.expires_at : null,
        });

    } catch (error) {
        console.error('Error fetching subscription:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}