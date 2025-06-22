import Stripe from 'stripe'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export async function POST(req) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const client = await clerkClient()

        const user = await client.users.getUser(userId)

        const { cardToken, priceId } = user.unsafeMetadata

        if (!cardToken || !priceId) {
            return NextResponse.json({ error: 'Card token and price ID are required' }, { status: 400 })
        }

        const customerId = user.publicMetadata.stripeCustomerId

        let pm;

        if (cardToken !== '') {
            pm = await stripe.paymentMethods.create({
                type: 'card',
                card: { token: cardToken },
            })

            await stripe.paymentMethods.attach(pm.id, { customer: customerId })

            await stripe.customers.update(customerId, {
                invoice_settings: { default_payment_method: pm.id }
            });
        }

        const subscription = await stripe.subscriptions.retrieve(user.publicMetadata.stripeSubscriptionId)

        if (!subscription) {
            return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
        }

        await stripe.subscriptions.update(subscription.id, {
            items: [{
                id: subscription.items.data[0].id,
                price: priceId,
            }],
            proration_behavior: 'always_invoice',
            payment_behavior: 'pending_if_incomplete',

        })


        const currentPublicMetadata = user.publicMetadata || {}

        const res1 = await client.users.updateUser(user.id, {
            publicMetadata: {
                ...currentPublicMetadata,
                stripeSubscriptionId: subscription.id,
            },
        })

        return NextResponse.json({ success: true, message: 'Subscription updated successfully', subscriptionId: subscription.id }, { status: 200 })
    } catch (error) {
        console.error('Error updating subscription:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}