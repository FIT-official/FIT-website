import { createWebhooksHandler } from '@brianmmdev/clerk-webhooks-handler'
import Stripe from 'stripe'
import { clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const handler = createWebhooksHandler({
    secret: process.env.CLERK_WEBHOOK_SECRET,
    onUserCreated: async (user) => {
        try {
            const { cardToken, priceId, basedIn, business_type } = user.unsafe_metadata || {}

            // If no priceId was selected, skip Stripe payment/subscription setup entirely
            if (!priceId) {
                const client = await clerkClient()
                const userObj = await client.users.getUser(user.id)
                const currentMetadata = userObj.publicMetadata || {}

                // create only minimal public metadata to indicate onboarding completed
                await client.users.updateUser(user.id, {
                    publicMetadata: {
                        ...currentMetadata,
                        role: 'user',
                    },
                })
                return
            }

            // For paid tiers, cardToken is required
            if (!cardToken) {
                console.warn(`User ${user.id} selected price ${priceId} but provided no card token. Skipping Stripe setup.`)
                return
            }

            // Create payment method from token
            const pm = await stripe.paymentMethods.create({
                type: 'card',
                card: { token: cardToken },
            })

            // Create a customer and attach the payment method
            const customer = await stripe.customers.create({
                email: user?.email_addresses?.[0]?.email_address,
                payment_method: pm.id,
            })

            // Create subscription for the selected price
            const subscription = await stripe.subscriptions.create({
                customer: customer.id,
                default_payment_method: pm.id,
                trial_period_days: 14,
                items: [{ price: priceId }],
                proration_behavior: 'always_invoice',
            })

            // Create Stripe Express account for the merchant
            const account = await stripe.accounts.create({
                type: 'express',
                country: basedIn,
                email: user?.email_addresses?.[0]?.email_address,
                business_type: business_type,
                capabilities: {
                    transfers: { requested: true },
                    card_payments: { requested: true },
                },
            });

            // Update Clerk user's public metadata with only the created IDs
            const client = await clerkClient()
            const userObj = await client.users.getUser(user.id)
            const currentMetadata = userObj.publicMetadata || {}

            const newMetadata = { ...currentMetadata, role: 'user' }
            if (customer?.id) newMetadata.stripeCustomerId = customer.id
            if (subscription?.id) newMetadata.stripeSubscriptionId = subscription.id
            if (account?.id) newMetadata.stripeAccountId = account.id

            await client.users.updateUser(user.id, {
                publicMetadata: newMetadata,
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