'use client'
import Link from 'next/link'
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useSignUp } from '@clerk/nextjs'
import { useState } from 'react'
import { sign } from 'crypto'
// import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

function SignUpForm({ setVerifying }) {
    const { isLoaded, signUp } = useSignUp()
    const stripe = useStripe()
    const elements = useElements()
    const [priceId, setPriceId] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [signUpMethod, setSignUpMethod] = useState('email')

    // const signUpWith = (strategy) => {
    //     return signUp
    //         .authenticateWithRedirect({
    //             strategy,
    //             redirectUrl: '/sign-up/sso-callback',
    //             redirectUrlComplete: '/dashboard',
    //         })
    //         .then((res) => {
    //             console.log(res)
    //         })
    //         .catch((err) => {
    //             // See https://clerk.com/docs/custom-flows/error-handling
    //             // for more info on error handling
    //             console.log(err.errors)
    //             console.error(err, null, 2)
    //         })
    // }

    async function onSubmit(ev) {
        ev.preventDefault()
        if (!isLoaded && !signUp) return null
        let cardToken = ''

        try {
            if (!elements || !stripe) {
                return
            }
            const cardEl = elements.getElement(CardElement)
            if (cardEl) {
                const res = await stripe?.createToken(cardEl)
                cardToken = res?.token?.id || ''
            }
        } catch (error) {
            console.error('Error loading card:', err)
        }

        if (signUpMethod === 'other') {
            try {
                signUp.authenticateWithRedirect({
                    strategy: 'oauth_google',
                    redirectUrl: '/sign-up/sso-callback',
                    redirectUrlComplete: '/dashboard',
                    unsafeMetadata: {
                        cardToken,
                        priceId,
                    },
                })
            } catch (error) {
                console.error('Error during sign up via other:', err)
            }
            return
        }

        try {

            await signUp.create({
                emailAddress: email,
                password: password,
                unsafeMetadata: {
                    cardToken,
                    priceId,
                },
            })

            await signUp.prepareEmailAddressVerification()
            setVerifying(true)
        } catch (err) {
            console.error('Error during sign up via email:', err)
            // Handle error (e.g., show a notification)
        }
    }

    return (
        <div className='flex items-center justify-center w-full h-full'>
            <form onSubmit={onSubmit} className='flex flex-col gap-4'>
                <h1 className='flex font-bold'>Create your account</h1>
                <p className='flex'>
                    Welcome! Please fill in the details to get started.
                </p>

                <div className='flex gap-2'>
                    <label>Select Sign Up Method</label>
                    <div className="flex flex-col gap-1">
                        <label>
                            <input
                                type="radio"
                                name="method"
                                value="email"
                                checked={signUpMethod === "email"}
                                onChange={(e) => setSignUpMethod(e.target.value)}
                            />
                            Email
                        </label>

                        <label>
                            <input
                                type="radio"
                                name="method"
                                value="other"
                                checked={signUpMethod === "other"}
                                onChange={(e) => setSignUpMethod(e.target.value)}
                            />
                            Other
                        </label>
                    </div>
                </div>

                {signUpMethod === 'other' ? (
                    <button type="submit">
                        Sign up with Google
                    </button>
                ) : (
                    <>
                        { /* email */}
                        <div className='flex gap-2'>
                            <label htmlFor='emailAddress'>Email</label>
                            <input
                                value={email}
                                onChange={(e) => setEmail(e.target.value.trim().toLowerCase())}
                                type='email'
                                id='emailAddress'
                                name='emailAddress'
                                required={signUpMethod === 'email'}
                            />
                        </div>

                        { /* password */}
                        <div className='flex gap-2 items-center'>
                            <label htmlFor='password'>Password</label>
                            <input
                                value={password}
                                onChange={(e) => setPassword(e.target.value.replace(/\s/g, ''))}
                                type={showPassword ? 'text' : 'password'}
                                id='password'
                                name='password'
                                required={signUpMethod === 'email'}
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((prev) => !prev)}
                                className="text-xs px-2 py-1 border rounded"
                                tabIndex={-1}
                            >
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                        </div>

                    </>
                )}

                {/* tier element */}
                <div className='flex gap-2'>
                    <label>Select Tier</label>
                    <div className="flex flex-col gap-1">
                        <label>
                            <input
                                type="radio"
                                name="tier"
                                value=""
                                checked={priceId === ""}
                                onChange={(e) => setPriceId("")}
                            />
                            Just join as Customer (no subscription)
                        </label>
                        <label>
                            <input
                                type="radio"
                                name="tier"
                                value="price_1RYmMAQ8qkF9EYSxkjocLoII"
                                checked={priceId === "price_1RYmMAQ8qkF9EYSxkjocLoII"}
                                onChange={(e) => setPriceId(e.target.value)}
                            />
                            Basic
                        </label>
                        <label>
                            <input
                                type="radio"
                                name="tier"
                                value="price_1RYmL7Q8qkF9EYSx0qQSc8zE"
                                checked={priceId === "price_1RYmL7Q8qkF9EYSx0qQSc8zE"}
                                onChange={(e) => setPriceId(e.target.value)}
                            />
                            Hobbyist
                        </label>
                        <label>
                            <input
                                type="radio"
                                name="tier"
                                value="price_1RYmMwQ8qkF9EYSxJskJvmYC"
                                checked={priceId === "price_1RYmMwQ8qkF9EYSxJskJvmYC"}
                                onChange={(e) => setPriceId(e.target.value)}
                            />
                            Advanced
                        </label>
                        <label>
                            <input
                                type="radio"
                                name="tier"
                                value="price_1RYmNXQ8qkF9EYSxFGHrQ4ZB"
                                checked={priceId === "price_1RYmNXQ8qkF9EYSxFGHrQ4ZB"}
                                onChange={(e) => setPriceId(e.target.value)}
                            />
                            Professional
                        </label>
                    </div>
                </div>

                {/* card element */}
                {priceId && (
                    <div className='flex flex-col gap-2 bg-white text-black'>
                        <label>Payment details</label>
                        <CardElement />
                    </div>
                )}

                <div id="clerk-captcha" />

                {signUpMethod === 'email' && (
                    <div className="grid w-full gap-y-4">
                        <button type="submit" disabled={!isLoaded}>
                            Sign up for trial
                        </button>
                        <button variant="link" size="sm" aschild="true">
                            <Link href="/sign-in">Already have an account? Sign in</Link>
                        </button>
                    </div>
                )}
            </form>
        </div>
    )
}

export default SignUpForm