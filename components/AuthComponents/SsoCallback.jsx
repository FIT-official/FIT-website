'use client'
import { AuthenticateWithRedirectCallback } from '@clerk/nextjs'
import { subscriptionIntentTarget, subscriptionPriceId } from '@/lib/subscriptionIntent'

export default function SsoCallback({ priceId }) {
    const destination = subscriptionIntentTarget(priceId, '/dashboard/shop')
    const forced = subscriptionPriceId(priceId) ? { signInForceRedirectUrl: destination, signUpForceRedirectUrl: destination } : {}
    return <AuthenticateWithRedirectCallback {...forced} signInFallbackRedirectUrl={destination} signUpFallbackRedirectUrl={destination} />
}
