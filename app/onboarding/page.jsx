'use client'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { completeOnboarding, updateRoleFromStripe } from './_actions'
import { useEffect, useState } from 'react'

function Onboarding() {
    const { user, isLoaded } = useUser()
    const router = useRouter()
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (!submitted) return
        let interval
        const poll = async () => {
            await user?.reload?.()
            if (user?.publicMetadata?.onboardingComplete) {
                router.push('/dashboard')
            }
        }
        interval = setInterval(poll, 500)
        return () => clearInterval(interval)
    }, [submitted, user])


    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!isLoaded) return
        const formData = new FormData(e.currentTarget)
        const res = await completeOnboarding(formData)
        if (res?.message) {
            console.log('Onboarding complete, updating role...')
            await updateRoleFromStripe(user.publicMetadata.stripeSubscriptionId)
            setSubmitted(true)
        }
        if (res?.error) {
            setError(res?.error)
        }
    }

    return (
        <div className="flex flex-col h-screen w-screen items-center justify-center">
            <div>Onboarding</div>
            <form onSubmit={handleSubmit}>
                <button type="submit">Submit</button>
            </form>
        </div>
    )
}

export default Onboarding