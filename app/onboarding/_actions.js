'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import User from '@/models/User'
import { getCreatorStripe, subscriptionBelongsToUser, subscriptionMetadata } from '@/lib/creatorEntitlements'
import { revalidatePath } from 'next/cache'

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

        const subscription = await getCreatorStripe().subscriptions.retrieve(subscriptionId)
        if (!subscriptionBelongsToUser(subscription, userObj)) {
            return { error: 'You do not have access to this subscription.' }
        }
        const latestUser = await client.users.getUser(userId)
        if (latestUser.publicMetadata?.stripeSubscriptionId !== subscriptionId) {
            return { error: 'Your subscription has changed. Refresh the page.' }
        }
        // Billing changes the plan only. Administrative roles are independent.
        const currentMetadata = latestUser.publicMetadata || {}
        const updatedUser = await client.users.updateUser(userId, {
            publicMetadata: {
                ...currentMetadata,
                ...subscriptionMetadata(subscription),
            },
        })

        return { message: 'Subscription refreshed', role: updatedUser.publicMetadata?.role, planId: updatedUser.publicMetadata?.creatorPlanId }
    } catch (error) {
        console.error('Error updating role from Stripe:', error)
        return { error: 'Failed to update role' }
    }
}
