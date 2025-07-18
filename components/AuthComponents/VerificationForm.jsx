'use client'
import { useSignUp } from '@clerk/nextjs'
import { useEffect, useRef, useState } from 'react'
import { IoMdLock } from 'react-icons/io'
import CodeField from './CodeField'
import Error from './Error'
import { useToast } from '../General/ToastProvider'

function VerificationForm() {
    const { isLoaded, signUp, setActive } = useSignUp()
    const [code, setCode] = useState('')
    const inputsRef = useRef([])
    const [error, setError] = useState('')
    const [timer, setTimer] = useState(0)
    const [loading, setLoading] = useState(false)
    const RESEND_INTERVAL = 60
    const { showToast } = useToast();

    async function handleVerification(e) {
        e.preventDefault()
        if (!isLoaded && !signUp) return null
        setError('')
        setLoading(true)
        try {
            const signInAttempt = await signUp.attemptEmailAddressVerification({
                code,
            })
            if (signInAttempt.status === 'complete') {
                await setActive({ session: signInAttempt.createdSessionId })
            } else {
                setError('Verification failed. Please try again.')
            }
        } catch (err) {
            showToast('Verification failed: ' + (err?.message || String(err)), 'error');
        }
        setLoading(false)
    }

    const handleResend = async () => {
        if (!signUp) return
        setError('')
        try {
            await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
            setTimer(RESEND_INTERVAL)
        } catch (err) {
            setError(err?.message || String(err) || 'Failed to resend code')
        }
    }

    useEffect(() => {
        if (timer === 0) return
        const interval = setInterval(() => {
            setTimer(t => t - 1)
        }, 1000)
        return () => clearInterval(interval)
    }, [timer])


    return (
        <form onSubmit={handleVerification} className='flex w-full md:w-[30vw] items-center justify-center flex-col gap-4 transition-all duration-300 ease-in-out'>
            <h1 className='mb-3'>Sign Up</h1>
            <Error error={error} setError={setError} />

            <div className='flex flex-col w-full gap-2 py-8 px-8 border border-borderColor rounded-2xl bg-white text-black items-center'>
                <label className='flex items-center font-medium w-full'>
                    <IoMdLock className='mr-2' size={16} />
                    Verification
                </label>
                <p className='text-sm text-textColor w-full'>
                    Please enter the verification code sent to your email address.
                </p>
                <CodeField code={code} setCode={setCode} inputsRef={inputsRef} />
                <h3 className="text-xs mt-2">
                    Resend code{" "}
                    <button
                        type="button"
                        className={`underline transition-colors ease-in-out duration-300 ${timer > 0 ? "text-gray-400 cursor-not-allowed" : "hover:text-textColor"}`}
                        onClick={handleResend}
                        disabled={timer > 0}
                        tabIndex={timer > 0 ? -1 : 0}
                    >
                        {timer > 0 ? `in ${timer} second${timer === 1 ? "" : "s"}` : "now"}
                    </button>
                    .
                </h3>
            </div>



            { /* verify */}
            <button
                type="submit" disabled={!isLoaded} className='authButton2 my-2'
            >
                {loading ? (
                    <>
                        Verifying
                        <div className='animate-spin ml-3 border-1 border-t-transparent h-3 w-3 rounded-full' />
                    </>
                ) : (
                    'Verify'
                )}
            </button>
        </form>

    )
}

export default VerificationForm