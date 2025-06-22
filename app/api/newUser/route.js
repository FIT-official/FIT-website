import { createWebhooksHandler } from '@brianmmdev/clerk-webhooks-handler'
import Stripe from 'stripe'
import { clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const handler = createWebhooksHandler({
    onUserCreated: async (user) => {
        try {
            const { cardToken, priceId } = user.unsafe_metadata
            if (!cardToken || !priceId) return

            const pm = await stripe.paymentMethods.create({
                type: 'card',
                card: { token: cardToken },
            })

            // console.log('Stripe payment method created:', pm.id)

            const customer = await stripe.customers.create({
                email: user?.email_addresses[0].email_address,
                payment_method: pm.id,
            })

            // console.log('Stripe customer created:', customer.id)

            const subscription = await stripe.subscriptions.create({
                customer: customer.id,
                default_payment_method: pm.id,
                trial_period_days: 14,
                items: [{ price: priceId }],
                proration_behavior: 'always_invoice',
            })

            // console.log('Stripe subscription created:', subscription.id)

            const client = await clerkClient()

            const res = await client.users.updateUser(user.id, {
                publicMetadata: {
                    stripeCustomerId: customer.id,
                    stripeSubscriptionId: subscription.id,
                },
            })

            // console.log('Clerk user updated with Stripe IDs:', user.id)
        } catch (error) {
            console.error('Stripe webhook error:', error)
        }
    },
})

// Wrap the handler to always return a response
export async function POST(req) {
    await handler.POST(req)
    return NextResponse.json({ received: true })
}