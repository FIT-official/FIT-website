'use client'
import Link from 'next/link'
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useSignUp } from '@clerk/nextjs'
import { useState } from 'react'
import PasswordField from './PasswordField'
import EmailField from './EmailField'
import AuthDivider from './AuthDivider'
import { FaGoogle } from 'react-icons/fa'
import { GoChevronLeft, GoChevronRight } from 'react-icons/go'
import Tier from './Tier'
import { IoMdLock } from 'react-icons/io'
import Error from './Error'

function SignUpForm({ setVerifying }) {
    const { isLoaded, signUp } = useSignUp()
    const stripe = useStripe()
    const elements = useElements()

    const [priceId, setPriceId] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')

    const [loading, setLoading] = useState(false)
    const [signUpMethod, setSignUpMethod] = useState('email')
    const [signUpStage, setSignUpStage] = useState('tier_selection')


    async function handleSubmit(ev) {
        ev.preventDefault()
        if (!isLoaded && !signUp) return null
        setLoading(true);
        setError('');
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

        if (signUpMethod === 'google') {
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
            console.error('Error during sign in:', error);
            setError(error.message || 'An error occurred during sign in');
        }
        setLoading(false);
    }

    const cancelError = () => {
        setError('');
    };

    const determineStageForward = () => {
        if (priceId === '') {
            setSignUpStage('first_factor')
        } else {
            setSignUpStage('payment')
        }
    }

    const determineStageBack = () => {
        if (priceId !== '') {
            setSignUpStage('payment')
        } else {
            setSignUpStage('tier_selection')
        }
    }

    return (
        <form onSubmit={handleSubmit} className='flex w-full md:w-[30vw] items-center justify-center flex-col gap-4 transition-all duration-300 ease-in-out'>
            <h1>Sign Up</h1>
            <h3 className="text-xs uppercase mb-3 mt-2">Have an account? <span className="underline hover:text-textColor transition-colors ease-in-out duration-300">
                <Link href='/sign-in'>
                    Sign in
                </Link>
            </span>.
            </h3>

            <Error error={error} setError={setError} />

            {signUpStage === 'tier_selection' && (
                <>
                    {/* tier element */}
                    <div className='flex flex-col gap-2 w-full'>
                        <Tier value="price_1RYmL7Q8qkF9EYSx0qQSc8zE" priceId={priceId} setPriceId={setPriceId} />
                        <Tier value="price_1RYmMAQ8qkF9EYSxkjocLoII" priceId={priceId} setPriceId={setPriceId} />
                        <Tier value="price_1RYmMwQ8qkF9EYSxJskJvmYC" priceId={priceId} setPriceId={setPriceId} />
                        <Tier value="price_1RYmNXQ8qkF9EYSxFGHrQ4ZB" priceId={priceId} setPriceId={setPriceId} />
                        <Tier value="" priceId={priceId} setPriceId={setPriceId} />
                    </div>
                    <button className='authButton2 gap-2 mt-3' type='button' onClick={determineStageForward}>
                        Select & Continue
                        <GoChevronRight size={20} />
                    </button>
                </>
            )}

            {signUpStage === 'payment' && (
                <>
                    <div className='flex flex-col w-full gap-2 py-8 px-8 border border-borderColor rounded-2xl bg-white text-black items-center'>
                        <label className='flex items-center font-medium w-full'>
                            <IoMdLock className='mr-2' size={16} />
                            Card Details
                        </label>
                        <p className='text-sm text-textColor w-full'>
                            This card will be used for automatic billing of your subscription.
                        </p>
                        <CardElement className='w-full mt-4 px-4 py-2 border border-borderColor rounded-lg' required={priceId !== ''} />
                        <p className='text-xs w-full mt-2 text-center text-lightColor '>
                            You can cancel or change your payment method at anytime.
                        </p>
                    </div>
                    <div className='flex items-center justify-between w-full'>
                        <button onClick={() => setSignUpStage('tier_selection')} className='toggleXbutton font-medium'>
                            <GoChevronLeft size={24} /> Go Back
                        </button>
                        <button onClick={() => setSignUpStage('first_factor')} className='toggleXbutton  font-medium'>
                            Continue <GoChevronRight size={24} />
                        </button>
                    </div>
                </>
            )}

            {signUpStage === 'first_factor' && (
                <>
                    <EmailField setEmail={setEmail} required={signUpMethod === 'email'} email={email} />

                    <PasswordField setPassword={setPassword} required={signUpMethod === 'email'} password={password} />

                    <div id="clerk-captcha" />

                    <button onClick={() => setSignUpMethod('email')} type='submit' className='authButton2'>
                        {loading && signUpMethod === 'email' ? (
                            <>
                                Signing In
                                <div className='animate-spin ml-3 border-1 border-t-transparent h-3 w-3 rounded-full' />
                            </>
                        ) :
                            'Sign In'
                        }
                    </button>

                    <AuthDivider />

                    <button onClick={() => setSignUpMethod('google')} type='submit' className='authButton1'>
                        {loading && signUpMethod === 'google' ? (
                            <>
                                Signing In
                                <div className='animate-spin ml-3 border-1 border-t-transparent h-3 w-3 rounded-full' />
                            </>
                        ) :
                            <>
                                Sign in with Google
                                <FaGoogle size={16} />
                            </>
                        }

                    </button>

                    <div className='flex items-center justify-start w-full mt-3'>
                        <button onClick={determineStageBack} type='button' className='toggleXbutton font-medium'>
                            <GoChevronLeft size={24} /> Go Back
                        </button>
                    </div>
                </>
            )}
        </form>

    )
}

export default SignUpForm