'use client'
import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import VerificationForm from '@/components/AuthComponents/VerificationForm'
import SignUpForm from '@/components/AuthComponents/SignUpForm'
import { useState } from 'react'

function SignUpPage() {
    const [verifying, setVerifying] = useState(false)
    const options = {
        appearance: {
            theme: 'stripe',
        },
    }
    const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
    if (verifying) {
        return <VerificationForm />
    }

    return (
        <div className='flex h-screen w-screen items-center justify-center'>
            <Elements options={options} stripe={stripePromise}>
                <SignUpForm setVerifying={setVerifying} />
            </Elements>
        </div>
    )
}

export default SignUpPage