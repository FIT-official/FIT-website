'use client'
import { useSignUp } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

function VerificationForm() {
    const { isLoaded, signUp, setActive } = useSignUp()
    const [code, setCode] = useState('')
    const router = useRouter()

    async function handleVerification(e) {
        e.preventDefault()
        if (!isLoaded && !signUp) return null

        try {
            const signInAttempt = await signUp.attemptEmailAddressVerification({
                code,
            })
            if (signInAttempt.status === 'complete') {
                await setActive({ session: signInAttempt.createdSessionId })
            } else {
                console.error('Verification failed:', signInAttempt.status)
            }
        } catch (err) {
            console.error('Error during verification:', err)
        }
    }

    return (
        <div className='flex flex-col items-center justify-center w-full h-full'>
            <h1 className='flex font-bold'>Create your account</h1>
            <p className='flex'>
                Welcome! Please fill in the details to get started.
            </p>
            <form onSubmit={handleVerification} className='flex flex-col gap-4'>

                { /* code entry */}
                <div className='flex flex-col gap-2'>
                    <label htmlFor="code">Enter your verification code</label>
                    <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        id="code"
                        name="code"
                        required
                    />
                </div>

                { /* verify */}
                <button
                    type="submit" disabled={!isLoaded}
                >
                    Verify
                </button>
            </form>
        </div>
    )
}

export default VerificationForm