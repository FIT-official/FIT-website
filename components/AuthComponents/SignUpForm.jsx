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
import { useToast } from '../General/ToastProvider'
import { supportedCountries } from '@/lib/supportedCountries'
import { STRIPE_PRICE_TIER_1, STRIPE_PRICE_TIER_2, STRIPE_PRICE_TIER_3, STRIPE_PRICE_TIER_4, debugStripeConfig } from '@/lib/stripeConfig'

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

    const [basedIn, setBasedIn] = useState('SG');
    const [businessType, setBusinessType] = useState('individual');
    const [cardToken, setCardToken] = useState('')
    const { showToast } = useToast();

    async function tokeniseAndContinue(ev) {
        ev.preventDefault()
        // Debug stripe configuration in development
        debugStripeConfig();

        try {
            if (!stripe || !elements) {
                showToast('Payment system not ready. Please try again.', 'error')
                return
            }

            const cardEl = elements.getElement(CardElement)
            if (!cardEl) {
                showToast('Card input not found. Please enter your card details.', 'error')
                return
            }

            const res = await stripe.createToken(cardEl)

            // Handle stripe tokenization errors explicitly
            if (res?.error) {
                setCardToken('')
                showToast(res.error.message || 'Failed to tokenize card', 'error')
                return
            }

            if (!res?.token?.id) {
                setCardToken('')
                showToast('Failed to tokenize card. Please check your card details.', 'error')
                return
            }

            setCardToken(res.token.id)
            setSignUpStage('connect_account')
        } catch (error) {
            showToast('Error loading card: ' + (error?.message || error), 'error');
            setCardToken('')
        }
        return;
    }

    async function handleSubmit(ev) {
        ev.preventDefault()
        if (!isLoaded && !signUp) return null
        setLoading(true);
        setError('');

        // If user selected a paid tier, ensure we have a card token
        if (priceId && priceId !== '' && !cardToken) {
            showToast('Please enter payment details and continue before completing signup.', 'error')
            setSignUpStage('payment')
            setLoading(false)
            return
        }

        if (signUpMethod === 'google') {
            try {
                // Build unsafe metadata but only include cardToken if present
                const unsafeMetadata = {
                    priceId,
                    basedIn,
                    businessType,
                }
                if (cardToken) unsafeMetadata.cardToken = cardToken

                signUp.authenticateWithRedirect({
                    strategy: 'oauth_google',
                    redirectUrl: '/sign-up/sso-callback',
                    redirectUrlComplete: '/dashboard',
                    unsafeMetadata,
                })
            } catch (error) {
                showToast('Error during sign up via Google: ' + (error?.message || error), 'error');
            }
            return
        }

        try {
            // Build unsafe metadata but only include cardToken if present
            const unsafeMetadata = {
                priceId,
                basedIn,
                businessType,
            }
            if (cardToken) unsafeMetadata.cardToken = cardToken

            await signUp.create({
                emailAddress: email,
                password: password,
                unsafeMetadata,
            })

            await signUp.prepareEmailAddressVerification()
            setVerifying(true)
        } catch (err) {
            console.error('Error during sign in:', err);
            setError(err?.message || 'An error occurred during sign in');
        }
        setLoading(false);
    }

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
                        <Tier value={STRIPE_PRICE_TIER_1()} priceId={priceId} setPriceId={setPriceId} />
                        <Tier value={STRIPE_PRICE_TIER_2()} priceId={priceId} setPriceId={setPriceId} />
                        <Tier value={STRIPE_PRICE_TIER_3()} priceId={priceId} setPriceId={setPriceId} />
                        <Tier value={STRIPE_PRICE_TIER_4()} priceId={priceId} setPriceId={setPriceId} />
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
                        <CardElement
                            options={{
                                hidePostalCode: true,
                                style: {
                                    base: {
                                        fontSize: '16px',
                                        color: '#32325d',
                                        '::placeholder': { color: '#a0aec0' },
                                    },
                                },
                            }}
                            className='w-full mt-4 px-4 py-2 border border-borderColor rounded-lg'
                            required={priceId !== ''}
                        />
                        <p className='text-xs w-full mt-2 text-center text-lightColor '>
                            You can cancel or change your payment method at anytime.
                        </p>
                    </div>
                    <div className='flex items-center justify-between w-full'>
                        <button onClick={() => setSignUpStage('tier_selection')} className='toggleXbutton font-medium text-sm items-center gap-2'>
                            <GoChevronLeft size={16} /> Go Back
                        </button>
                        <button onClick={(ev) => tokeniseAndContinue(ev)} className='toggleXbutton  font-medium text-sm items-center gap-2'>
                            Continue <GoChevronRight size={24} />
                        </button>
                    </div>
                </>
            )}

            {signUpStage === 'connect_account' && (
                <>
                    <div className='flex flex-col w-full gap-2 py-8 px-8 border border-borderColor rounded-2xl bg-white text-black items-center'>
                        <label className='flex items-center font-medium w-full'>
                            <IoMdLock className='mr-2' size={16} />
                            Stripe Account
                        </label>
                        <p className='text-sm text-textColor w-full'>
                            This information will be used to help you
                            accept sales payments and move those funds to your bank account.
                        </p>

                        <div className="flex flex-col gap-3 w-full my-4">
                            <div className="flex flex-col gap-1 w-full">
                                <label className="text-xs font-medium">
                                    Business Type
                                </label>
                                <select
                                    className="bankAccountFormField"
                                    value={businessType}
                                    onChange={e => setBusinessType(e.target.value)}
                                    required
                                >
                                    <option value="individual">Individual</option>
                                    <option value="company">Company</option>
                                    <option value="non_profit">Non-Profit</option>
                                    <option value="government_entity">Government Entity</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-1 w-full">
                                <label className="text-xs font-medium">Based In</label>
                                <select
                                    className="bankAccountFormField"
                                    value={basedIn}
                                    onChange={e => setBasedIn(e.target.value)}
                                    required
                                >
                                    {supportedCountries.map(country => (
                                        <option key={"basedIn-" + country.code} value={country.code}>
                                            {country.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                    </div>
                    <div className='flex items-center justify-between w-full'>
                        <button onClick={() => setSignUpStage('payment')} className='toggleXbutton font-medium text-sm items-center gap-2'>
                            <GoChevronLeft size={16} /> Go Back
                        </button>
                        <button onClick={() => setSignUpStage('first_factor')} className='toggleXbutton  font-medium text-sm items-center gap-2'>
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
                        <button onClick={determineStageBack} type='button' className='toggleXbutton font-medium text-sm items-center gap-2'>
                            <GoChevronLeft size={24} /> Go Back
                        </button>
                    </div>
                </>
            )}
        </form>

    )
}

export default SignUpForm