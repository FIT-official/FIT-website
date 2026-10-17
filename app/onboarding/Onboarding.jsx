'use client'

import { useUser, useSession } from '@clerk/nextjs'
import { completeOnboarding, updateRoleFromStripe } from './_actions'
import { useState } from 'react'
import Logo from '@/components/Logo'
import posthog from 'posthog-js'
import { subscriptionIntentTarget } from '@/lib/subscriptionIntent'
import TermsCheckbox from '@/components/Legal/TermsCheckbox'
import TermsGatedButton from '@/components/Legal/TermsGatedButton'
import { CUSTOMER_TERMS_VERSION } from '@/content/legal/customerTermsV1'

function Onboarding({ priceId, termsRequired = false }) {
    const { user, isLoaded } = useUser()
    const { session } = useSession()
    const [error, setError] = useState(null)
    const [loading, setLoading] = useState(false)
    const [termsTicked, setTermsTicked] = useState(false)
    const [termsError, setTermsError] = useState(false)

    const handleSubmit = async (event) => {
        event.preventDefault()

        if (termsRequired && !termsTicked) {
            setTermsError(true)
            return
        }

        if (!isLoaded || !user || loading) return

        setLoading(true)
        setError(null)

        try {
            const formData = new FormData(event.currentTarget)

            const res = await completeOnboarding(formData)

            if (res?.error || !res?.message) {
                if (
                    res?.code === 'terms_required' ||
                    res?.code === 'terms_version_changed'
                ) {
                    setTermsTicked(false)
                    setTermsError(true)
                }

                throw new Error(
                    res?.error || 'Unable to complete account setup.'
                )
            }

            if (user.publicMetadata?.stripeSubscriptionId) {
                await updateRoleFromStripe(
                    user.publicMetadata.stripeSubscriptionId
                )
            }

            try {
                posthog.capture('onboarding_completed')
            } catch {
                // Analytics is optional.
            }

            await user.reload()
            await session?.getToken({ skipCache: true })

            window.location.href = subscriptionIntentTarget(
                priceId,
                '/dashboard/shop'
            )
        } catch (err) {
            setError(
                err?.message ||
                'Unable to complete account setup. Please try again.'
            )
        } finally {
            setLoading(false)
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="flex flex-col w-full items-center h-[92vh] justify-center border-b border-borderColor px-8 gap-4"
        >
            <Logo
                width={200}
                height={200}
                className="flex"
            />

            <h1>
                Welcome
                {isLoaded && user?.firstName
                    ? ', ' + user.firstName
                    : ''}
                .
            </h1>

            <p className="w-1/2 md:w-1/3 text-center text-pretty inline">
                Please finish setting up your{' '}
                <span className="font-medium inline">
                    Fix It Today
                </span>{' '}
                account to continue.
            </p>

            {termsRequired && (
                <div className="w-full max-w-md">
                    <TermsCheckbox
                        document="customer"
                        checked={termsTicked}
                        onChange={value => {
                            setTermsTicked(value)
                            setTermsError(false)
                        }}
                        error={termsError}
                    />

                    <input
                        type="hidden"
                        name="termsAccepted"
                        value={termsTicked ? 'true' : 'false'}
                    />

                    <input
                        type="hidden"
                        name="termsVersion"
                        value={CUSTOMER_TERMS_VERSION}
                    />
                </div>
            )}

            <div className="flex w-1/4 mt-4">
                <TermsGatedButton
                    type="submit"
                    disabled={loading || !isLoaded || !user}
                    termsRequired={termsRequired}
                    termsTicked={termsTicked}
                    onTermsError={() => setTermsError(true)}
                    className="authButton2"
                >
                    {loading ? (
                        <>
                            Setting Things Up
                            <div className="animate-spin ml-3 border-1 border-t-transparent h-3 w-3 rounded-full" />
                        </>
                    ) : (
                        'Begin Now'
                    )}
                </TermsGatedButton>
            </div>

            {error && (
                <p
                    role="alert"
                    className="text-sm text-red-600 dark:text-red-400 mt-2"
                >
                    {error}
                </p>
            )}
        </form>
    )
}

export default Onboarding
