'use client'
import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import VerificationForm from '@/components/AuthComponents/VerificationForm'
import SignUpForm from '@/components/AuthComponents/SignUpForm'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'

function SignUpPage() {
    const { isSignedIn, isLoaded } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            router.replace("/dashboard");
        }
    }, [isLoaded, isSignedIn, router]);


    const [verifying, setVerifying] = useState(false)
    const options = {
        appearance: {
            theme: 'flat',
        },
    }
    const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)

    if (verifying) {
        return (
            <div className='flex w-full items-center h-[92vh] justify-center border-b border-borderColor px-8'>
                <VerificationForm />
            </div>
        )
    }

    return (
        <div className='flex w-full items-center h-[92vh] justify-center border-b border-borderColor px-8'>
            <Elements options={options} stripe={stripePromise}>
                <SignUpForm setVerifying={setVerifying} />
            </Elements>
        </div>
    )
}

export default SignUpPage