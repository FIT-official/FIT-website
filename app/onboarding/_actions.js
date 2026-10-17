'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import User from '@/models/User'
import {
  getCreatorStripe,
  subscriptionBelongsToUser,
  subscriptionMetadata,
} from '@/lib/creatorEntitlements'
import { revalidatePath } from 'next/cache'
import { isTermsCheckboxEnabled } from '@/lib/legalFlags'
import {
  checkAcceptance,
  recordAcceptance,
} from '@/lib/termsAcceptance'

export const completeOnboarding = async formData => {
  const { userId } = await auth()

  if (!userId) {
    return { error: 'Unauthorised' }
  }

  try {
    const termsRequired = isTermsCheckboxEnabled()
    let checkedTerms = null

    if (termsRequired) {
      // Only an explicit submission counts. Clerk unsafeMetadata
      // is not authoritative and must not silently waive the gate.
      const accepted = formData?.get?.('termsAccepted') === 'true'
      const termsVersion = formData?.get?.('termsVersion')

      checkedTerms = checkAcceptance(
        {
          accepted,
          termsVersion,
        },
        'customer'
      )
    }

    await connectToDatabase()

    if (termsRequired) {
      await recordAcceptance({
        userId,
        context: 'signup',
        document: 'customer',
        termsVersion: checkedTerms.termsVersion,
        referenceId: userId,
      })
    }

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

    revalidatePath('/', 'layout')
    revalidatePath('/onboarding')

    return {
      message: 'Onboarding complete',
      publicMetadata: res.publicMetadata,
    }
  } catch (error) {
    if (
      typeof error?.code === 'string' &&
      [
        'terms_required',
        'terms_version_changed',
        'preview_read_only',
        'acceptance_write_failed',
      ].includes(error.code)
    ) {
      return {
        error: error.message,
        code: error.code,
      }
    }

    console.error('Error completing onboarding:', error)

    return {
      error: 'Failed to complete onboarding',
    }
  }
}

export const updateRoleFromStripe = async subscriptionId => {
  const { userId } = await auth()

  if (!userId) {
    return { error: 'Unauthorised' }
  }

  if (!subscriptionId) {
    return { error: 'No subscription ID provided.' }
  }

  try {
    const client = await clerkClient()
    const userObj = await client.users.getUser(userId)

    const trueSubscriptionID =
      userObj.publicMetadata?.stripeSubscriptionId

    if (trueSubscriptionID !== subscriptionId) {
      return {
        error: 'You do not have access to this subscription.',
      }
    }

    const subscription =
      await getCreatorStripe().subscriptions.retrieve(
        subscriptionId
      )

    if (!subscriptionBelongsToUser(subscription, userObj)) {
      return {
        error: 'You do not have access to this subscription.',
      }
    }

    const latestUser = await client.users.getUser(userId)

    if (
      latestUser.publicMetadata?.stripeSubscriptionId !==
      subscriptionId
    ) {
      return {
        error: 'Your subscription has changed. Refresh the page.',
      }
    }

    const currentMetadata =
      latestUser.publicMetadata || {}

    const updatedUser = await client.users.updateUser(
      userId,
      {
        publicMetadata: {
          ...currentMetadata,
          ...subscriptionMetadata(subscription),
        },
      }
    )

    return {
      message: 'Subscription refreshed',
      role: updatedUser.publicMetadata?.role,
      planId: updatedUser.publicMetadata?.creatorPlanId,
    }
  } catch (error) {
    console.error('Error updating role from Stripe:', error)

    return {
      error: 'Failed to update role',
    }
  }
}
