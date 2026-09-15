'use client'
// Tier selection + payment step for subscription changes. Restyled onto the
// account design tokens; the Stripe/Clerk flow is unchanged (card token into
// unsafeMetadata, then POST /api/user/subscription/edit).
import { useUser } from '@clerk/nextjs'
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useStripePriceIds } from '@/utils/StripePriceIdsContext'
import { useToast } from '../General/ToastProvider'
import Tier from '../AuthComponents/Tier'
import { IoMdLock } from 'react-icons/io'
import { GoChevronLeft } from 'react-icons/go'

function SubscriptionDetailsInner() {
    const stripe = useStripe();
    const elements = useElements();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoaded } = useUser();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState('tier_selection');
    const { showToast } = useToast();

    // Use shared Stripe price IDs context
    const { stripePriceIds, loading: priceIdsLoading, error: priceIdsError } = useStripePriceIds();
    // Use shared subscription context
    const { subscription, loading: subLoading, error: subError } = require('@/utils/UserSubscriptionContext').useUserSubscription();
    const [priceId, setPriceId] = useState('');

    // Preselect tier from query param (used by /creators/join pricing cards)
    useEffect(() => {
        const incoming = (searchParams?.get('priceId') || '').trim();
        if (!incoming) return;
        // Only preselect if user isn't already subscribed to a tier.
        if (subLoading) return;
        if (subscription?.priceId) return;
        setPriceId(incoming);
    }, [searchParams, subLoading, subscription?.priceId]);

    // Set priceId from subscription context when loaded
    useEffect(() => {
        if (!subLoading && subscription) {
            setPriceId(subscription?.priceId || '');
        } else if (!subLoading && subscription === null) {
            setPriceId('');
        }
    }, [subLoading, subscription]);

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

    if (priceIdsLoading) return <p className="text-[13px] dash-soft text-center py-8">Loading subscription tiers...</p>;
    if (priceIdsError) return <p className="text-[13px] font-medium text-[var(--dash-bad)] text-center py-8">Failed to load subscription tiers.</p>;
    if (!stripePriceIds) return <p className="text-[13px] dash-soft text-center py-8">No subscription tiers found.</p>;

    return (
        <div className="flex flex-col items-center w-full max-w-lg mx-auto py-6">
            <h2 className="dash-section mb-1">Choose your subscription tier</h2>
            <p className="text-[13px] dash-soft mb-6 text-center">
                Select a new tier to update your subscription.
            </p>
            <form className="flex flex-col gap-4 w-full" onSubmit={updateSubscription}>
                {step === 'tier_selection' && (
                    <>
                        <div className="flex flex-col gap-2 w-full">
                            <Tier value={stripePriceIds.tier1} priceId={priceId} setPriceId={setPriceId} />
                            <Tier value={stripePriceIds.tier2} priceId={priceId} setPriceId={setPriceId} />
                            <Tier value={stripePriceIds.tier3} priceId={priceId} setPriceId={setPriceId} />
                            <Tier value={stripePriceIds.tier4} priceId={priceId} setPriceId={setPriceId} />
                            <Tier value="" priceId={priceId} setPriceId={setPriceId} />
                        </div>
                        <button
                            className="dash-hoverable inline-flex items-center justify-center rounded-full bg-[var(--dash-ink)] text-[var(--dash-canvas)] px-4 py-2.5 text-[13px] font-medium w-full mt-2 cursor-pointer disabled:opacity-50 active:scale-[0.97]"
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
                        <div className="flex flex-col w-full gap-2 py-6 px-5 border border-[var(--dash-line)] rounded-[var(--dash-r-card)] bg-[var(--dash-card)] items-center">
                            <label className="flex items-center text-[13px] font-medium w-full">
                                <IoMdLock className="mr-2" size={16} />
                                Card details
                            </label>
                            <p className="text-[13px] dash-soft w-full">
                                This card will be used for automatic billing of your subscription.
                            </p>
                            <CardElement
                                className="w-full mt-3 px-4 py-2.5 border border-[var(--dash-line)] rounded-[var(--dash-r-inner)] bg-[var(--dash-card)]"
                                required={priceId !== ''}
                            />
                            <p className="text-[12px] font-medium dash-soft w-full mt-2 text-center">
                                You can cancel or change your payment method at anytime.
                            </p>
                        </div>
                        <div className="flex flex-col items-center justify-between w-full gap-3">
                            <button
                                type="submit"
                                className="dash-hoverable inline-flex items-center justify-center rounded-full bg-[var(--dash-ink)] text-[var(--dash-canvas)] px-4 py-2.5 text-[13px] font-medium w-full cursor-pointer disabled:opacity-50 active:scale-[0.97]"
                                disabled={loading}
                            >
                                {loading ? 'Signing Up...' : 'Sign Up'}
                            </button>
                            <button
                                type="button"
                                className="dash-hoverable inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium dash-soft hover:text-[var(--dash-ink)] cursor-pointer"
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

// No need to wrap with provider, already provided at app root
export default SubscriptionDetailsInner;
