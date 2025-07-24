'use client'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { completeOnboarding, updateRoleFromStripe } from './_actions'
import { useEffect, useState } from 'react'
import Logo from '@/components/Logo'

function Onboarding() {
    const { user, isLoaded } = useUser()
    const router = useRouter()
    const [submitted, setSubmitted] = useState(false)
    const [onboardingStage, setOnboardingStage] = useState('intro')
    const [error, setError] = useState(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!submitted) return
        let interval
        const poll = async () => {
            await user?.reload?.()
            if (user?.publicMetadata?.onboardingComplete) {
                setLoading(false)
                router.push('/dashboard')
            }
        }
        interval = setInterval(poll, 500)
        return () => clearInterval(interval)
    }, [submitted, user])


    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!isLoaded) return
        setLoading(true)
        const formData = new FormData(e.currentTarget)
        const res = await completeOnboarding(formData)
        if (res?.message) {
            await updateRoleFromStripe(user.publicMetadata.stripeSubscriptionId)
            setSubmitted(true)
        }
        if (res?.error) {
            setError(res?.error)

        }
    }

    return (
        <form onSubmit={handleSubmit} className='flex flex-col w-full items-center h-[92vh] justify-center border-b border-borderColor px-8 gap-4'>
            <Logo
                width={200}
                height={200}
                className='flex'
            />
            <h1>Welcome{isLoaded && user.firstName ? ", " + user?.firstName : ""}.</h1>
            <p className='w-1/2 md:w-1/3 text-center text-pretty inline'>
                <span className='font-medium inline'>FixItTodaySG</span> is a Singapore-based technology solutions provider specializing in additive manufacturing and hardware integration. We're excited to have you on board!
            </p>
            {/* {onboardingStage === 'complete' && (
                
            )} */}
            <div className='flex w-1/4 mt-4'>
                <button type="submit" className='authButton2'>
                    {loading ?
                        <>
                            Setting Things Up
                            <div className='animate-spin ml-3 border-1 border-t-transparent h-3 w-3 rounded-full' />
                        </>
                        :
                        'Begin Now'}
                </button>
            </div>

        </form>

    )
}

export default Onboarding