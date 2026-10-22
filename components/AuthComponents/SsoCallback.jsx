'use client'
import { AuthenticateWithRedirectCallback } from '@clerk/nextjs'
import { subscriptionIntentTarget, subscriptionPriceId } from '@/lib/subscriptionIntent'
import { advancedClassesReturn } from '@/lib/advancedClasses/signInReturn'

export default function SsoCallback({ priceId, returnTo }) {
    const featureReturn = advancedClassesReturn(returnTo)
    const destination = subscriptionIntentTarget(priceId, featureReturn || '/dashboard/shop')
    const forced = subscriptionPriceId(priceId) || featureReturn ? { signInForceRedirectUrl: destination, signUpForceRedirectUrl: destination } : {}
    return <AuthenticateWithRedirectCallback {...forced} signInFallbackRedirectUrl={destination} signUpFallbackRedirectUrl={destination} />
}
