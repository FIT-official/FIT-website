'use client'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { completeOnboarding, updateRoleFromStripe } from './_actions'
import { useEffect, useState } from 'react'

function Onboarding() {
    const { user, isLoaded } = useUser()
    const router = useRouter()
    const [submitted, setSubmitted] = useState(false)
    const [onboardingStage, setOnboardingStage] = useState('intro')
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
        <form onSubmit={handleSubmit} className='flex flex-col w-full items-center h-[92vh] justify-center border-b border-borderColor px-8 gap-4'>
            <h1>Welcome to FIT!</h1>
            <p className='w-2/3 text-center flex'>
                FixItTodaySG is a Singapore-based technology solutions provider specializing in additive manufacturing and hardware integration. We offer a comprehensive suite of services including 3D printing, printer maintenance, filament supply, and electronics sourcing- catering to individuals, educators, and organisations seeking reliable prototyping and fabrication support.
            </p>
            {onboardingStage === 'complete' && (
                <div className='flex w-1/3'>
                    <button type="submit" className='authButton2'>Submit</button>
                </div>
            )}


        </form>

    )
}

export default Onboarding