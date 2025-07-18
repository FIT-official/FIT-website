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

        let customerId = user.publicMetadata.stripeCustomerId
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.emailAddresses[0]?.emailAddress,
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            });
            customerId = customer.id;
            await client.users.updateUser(user.id, {
                publicMetadata: {
                    ...user.publicMetadata,
                    stripeCustomerId: customerId,
                },
            });
        }

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
        let subscriptionId = user.publicMetadata.stripeSubscriptionId;
        if (!subscriptionId) {
            const subscription = await stripe.subscriptions.create({
                customer: customerId,
                items: [{ price: priceId }],
                default_payment_method: pm?.id,
                payment_behavior: 'default_incomplete',
                expand: ['latest_invoice.payment_intent'],
            });
            subscriptionId = subscription.id;
        } else {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            if (!subscription) {
                return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
            }
            await stripe.subscriptions.update(subscription.id, {
                items: [{
                    id: subscription.items.data[0].id,
                    price: priceId,
                }],
                proration_behavior: 'always_invoice',
                payment_behavior: 'pending_if_incomplete',
            });
        }

        const currentPublicMetadata = user.publicMetadata || {};
        await client.users.updateUser(user.id, {
            publicMetadata: {
                ...currentPublicMetadata,
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscriptionId,
            },
        });

        return NextResponse.json(
            { success: true, message: 'Subscription updated successfully', subscriptionId },
            { status: 200 }
        )
    } catch (error) {
        console.error('Error updating subscription:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}