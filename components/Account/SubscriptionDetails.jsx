'use client'
import { useUser } from '@clerk/nextjs'
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useToast } from '../General/ToastProvider'
import Tier from '../AuthComponents/Tier'
import { IoMdLock } from 'react-icons/io'
import { GoChevronLeft } from 'react-icons/go'

function SubscriptionDetails() {
    const stripe = useStripe()
    const elements = useElements()
    const router = useRouter()
    const { user, isLoaded } = useUser()
    const [loading, setLoading] = useState(false)
    const [priceId, setPriceId] = useState('')
    const [step, setStep] = useState('tier_selection')
    const { showToast } = useToast();

    useEffect(() => {
        const fetchSubscription = async () => {
            const res = await fetch('/api/user/subscription')
            if (res.ok) {
                const data = await res.json()
                setPriceId(data?.priceId || '')
            } else if (res.status === 404) {
                setPriceId('')
            } else {
                showToast('Failed to fetch subscription: ' + res.statusText, 'error')
            }
        }
        fetchSubscription()
    }, [user, isLoaded])

    const updateSubscription = async (e) => {
        e.preventDefault();
        if (!isLoaded && !user) return null
        let cardToken = ''
        setLoading(true);

        try {
            if (!elements || !stripe) {
                setLoading(false);
                return
            }
            const cardEl = elements.getElement(CardElement)
            if (cardEl) {
                const tokenRes = await stripe?.createToken(cardEl)
                cardToken = tokenRes?.token?.id || ''
            }
            await user.update({
                unsafeMetadata: {
                    ...user.unsafeMetadata,
                    cardToken: cardToken,
                    priceId: priceId
                }
            })
            const res = await fetch('/api/user/subscription/edit', { method: 'POST' })
            if (res.ok) {
                const data = await res.json()
                setLoading(false);
                router.push(`/account/subscription/success?id=${data?.subscriptionId}`)
            } else {
                setLoading(false);
            }
        } catch (error) {
            setLoading(false);
            showToast('Error updating subscription: ' + error, 'error');
        }
    }

    return (
        <div className="flex flex-col items-center w-full max-w-lg mx-auto py-8">
            <h2 className="text-2xl font-bold mb-2 text-textColor">Choose Your Subscription Tier</h2>
            <p className="text-xs text-lightColor mb-6 text-center">
                Select a new tier to update your subscription.
            </p>
            <form className="flex flex-col gap-4 w-full" onSubmit={updateSubscription}>
                {step === 'tier_selection' && (
                    <>
                        <div className="flex flex-col gap-2 w-full">
                            <Tier value="price_1RoLEqL8rcZaPQbIbEJFpb8w" priceId={priceId} setPriceId={setPriceId} />
                            <Tier value="price_1RoLFaL8rcZaPQbIkidotx2y" priceId={priceId} setPriceId={setPriceId} />
                            <Tier value="price_1RoLGsL8rcZaPQbIMgKmvF5q" priceId={priceId} setPriceId={setPriceId} />
                            <Tier value="price_1RoLJEL8rcZaPQbIhoVl8diR" priceId={priceId} setPriceId={setPriceId} />
                            <Tier value="" priceId={priceId} setPriceId={setPriceId} />
                        </div>
                        <button
                            className="formBlackButton w-full mt-3"
                            type="button"
                            onClick={() => setStep('payment')}
                            disabled={!priceId}
                        >
                            Select & Continue
                        </button>
                    </>
                )}
                {step === 'payment' && (
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
                        <div className='flex flex-col items-center justify-between w-full gap-4'>

                            <button
                                type="submit"
                                className="formBlackButton w-full"
                                disabled={loading}
                            >
                                {loading ? 'Signing Up...' : 'Sign Up'}
                            </button>
                            <button
                                type="button"
                                className='toggleXbutton items-center gap-2 text-sm font-medium'
                                onClick={() => setStep('tier_selection')}
                            >
                                <GoChevronLeft size={16} /> Go Back
                            </button>
                        </div>
                    </>
                )}
            </form>
        </div>
    );

}

export default SubscriptionDetails