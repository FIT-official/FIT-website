'use client'
import { useUser, useSession } from '@clerk/nextjs'
import { completeOnboarding, updateRoleFromStripe } from './_actions'
import { useState } from 'react'
import Logo from '@/components/Logo'
import posthog from 'posthog-js'
import { subscriptionIntentTarget } from '@/lib/subscriptionIntent'


function Onboarding({ priceId }) {
    const { user, isLoaded } = useUser()
    const { session } = useSession()
    const [error, setError] = useState(null)
    const [loading, setLoading] = useState(false)

    // No client-side redirect; handled by server layout

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!isLoaded || !user || loading) return
        setLoading(true)
        setError(null)
        try {
            const formData = new FormData(e.currentTarget)
            const res = await completeOnboarding(formData)
            if (res?.error || !res?.message) throw new Error(res?.error || 'Unable to complete account setup.')
            if (user.publicMetadata?.stripeSubscriptionId) {
                await updateRoleFromStripe(user.publicMetadata.stripeSubscriptionId)
            }
            try { posthog.capture('onboarding_completed') } catch { /* Analytics is optional. */ }
            await user.reload()
            await session?.getToken({ skipCache: true })
            window.location.href = subscriptionIntentTarget(priceId, '/dashboard/shop')
        } catch (err) {
            setError(err?.message || 'Unable to complete account setup. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className='flex flex-col w-full items-center h-[92vh] justify-center border-b border-borderColor px-8 gap-4'>
            <Logo
                width={200}
                height={200}
                className='flex'
            />
            <h1>Welcome{isLoaded && user?.firstName ? ", " + user.firstName : ""}.</h1>
            <p className='w-1/2 md:w-1/3 text-center text-pretty inline'>
                <span className='font-medium inline'>FixItTodaySG</span> is a Singapore-based technology solutions provider specializing in additive manufacturing and hardware integration. We&apos;re excited to have you on board!
            </p>
            {/* {onboardingStage === 'complete' && (
                
            )} */}
            <div className='flex w-1/4 mt-4'>
                <button type="submit" disabled={loading} className='authButton2'>
                    {loading ?
                        <>
                            Setting Things Up
                            <div className='animate-spin ml-3 border-1 border-t-transparent h-3 w-3 rounded-full' />
                        </>
                        :
                        'Begin Now'}
                </button>
            </div>
            {error && (
                <p className='text-sm text-red-600 dark:text-red-400 mt-2'>{error}</p>
            )}

        </form>

    )
}

export default Onboarding
