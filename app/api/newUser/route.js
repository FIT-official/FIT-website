import { createWebhooksHandler } from '@brianmmdev/clerk-webhooks-handler'
import Stripe from 'stripe'
import { clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const handler = createWebhooksHandler({
    secret: process.env.CLERK_WEBHOOK_SECRET,
    onUserCreated: async (user) => {
        try {
            const { cardToken, priceId, basedIn, business_type } = user.unsafe_metadata
            // if (!cardToken || !priceId || !basedIn || !business_type) return

            const pm = await stripe.paymentMethods.create({
                type: 'card',
                card: { token: cardToken },
            })

            const customer = await stripe.customers.create({
                email: user?.email_addresses[0].email_address,
                payment_method: pm.id,
            })

            const subscription = await stripe.subscriptions.create({
                customer: customer.id,
                default_payment_method: pm.id,
                trial_period_days: 14,
                items: [{ price: priceId }],
                proration_behavior: 'always_invoice',
            })

            const account = await stripe.accounts.create({
                type: 'express',
                country: basedIn,
                email: user?.email_addresses[0].email_address,
                business_type: business_type,
                capabilities: {
                    transfers: { requested: true },
                    card_payments: { requested: true },
                },
            });

            const client = await clerkClient()
            const userObj = await client.users.getUser(user.id)
            const currentMetadata = userObj.publicMetadata || {}

            const res = await client.users.updateUser(user.id, {
                publicMetadata: {
                    ...currentMetadata,
                    stripeCustomerId: customer.id,
                    stripeSubscriptionId: subscription.id,
                    stripeAccountId: account.id,
                    expressAccountOnboarded: false,
                },
            })
        } catch (error) {
            console.error('Clerk webhook error:', error)
        }
    },
})

export async function POST(req) {
    await handler.POST(req)
    return NextResponse.json({ received: true })
}