'use client'
import VerificationForm from '@/components/AuthComponents/VerificationForm'
import SignUpForm from '@/components/AuthComponents/SignUpForm'
import { useState } from 'react'
export default function SignUpPage({ priceId }) {
    const [verifying, setVerifying] = useState(false)
    return <div className="flex w-full items-center min-h-[80vh] justify-center border-b border-borderColor px-8 py-12">
        {verifying ? <VerificationForm priceId={priceId} /> : <SignUpForm setVerifying={setVerifying} priceId={priceId} />}
    </div>
}
