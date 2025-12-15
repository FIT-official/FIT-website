'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import User from '@/models/User'
import Stripe from 'stripe'
import { revalidatePath } from 'next/cache'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export const completeOnboarding = async (formData) => {
    const { userId } = await auth()
    if (!userId) {
        return { error: 'Unauthorised' }
    }

    try {
        await connectToDatabase()
        let user = await User.findOne({ userId })

        if (!user) {
            user = new User({ userId })
            await user.save()
        }

        const client = await clerkClient()

        const userObj = await client.users.getUser(userId)
        const currentMetadata = userObj.publicMetadata || {}

        const res = await client.users.updateUser(userId, {
            publicMetadata: {
                ...currentMetadata,
                onboardingComplete: true,
            },
        })

        // Force Next.js to revalidate the middleware auth state
        revalidatePath('/', 'layout')
        revalidatePath('/onboarding')

        return { message: 'Onboarding complete', publicMetadata: res.publicMetadata }

    } catch (error) {
        console.error('Error completing onboarding:', error)
        return { error: 'Failed to complete onboarding' }
    }
}

export const updateRoleFromStripe = async (subscriptionId) => {
    const { userId } = await auth()
    if (!userId) return { error: 'Unauthorised' }
    if (!subscriptionId) return { error: 'No subscription ID provided.' }


    try {
        const client = await clerkClient()
        const userObj = await client.users.getUser(userId)
        const trueSubscriptionID = userObj.publicMetadata?.stripeSubscriptionId

        if (trueSubscriptionID !== subscriptionId) {
            return { error: 'You do not have access to this subscription.' }
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const priceId = subscription.items.data[0]?.price?.id
        let role = "Customer"
        if (priceId) {
            const price = await stripe.prices.retrieve(priceId)
            if (price.product) {
                const product = await stripe.products.retrieve(price.product)
                if (product.name) {
                    role = product.name
                }
            }
        }

        // Persist role only in Clerk publicMetadata, not in the local DB
        const currentMetadata = userObj.publicMetadata || {}
        const updatedUser = await client.users.updateUser(userId, {
            publicMetadata: {
                ...currentMetadata,
                role,
            },
        })

        return { message: 'Role updated', role: updatedUser.publicMetadata?.role }
    } catch (error) {
        console.error('Error updating role from Stripe:', error)
        return { error: 'Failed to update role' }
    }
}