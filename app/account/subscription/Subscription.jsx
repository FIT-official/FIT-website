'use client'
import { useEffect, useState } from 'react'
import { Elements } from '@stripe/react-stripe-js'
import SubscriptionDetails from '@/components/Account/SubscriptionDetails';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

import { useUserSubscription } from '@/utils/UserSubscriptionContext';

function Subscription() {
    const [updating, setUpdating] = useState(false);
    const { subscription, loading: subLoading, error: subError } = useUserSubscription();

    const updateSubButton = () => setUpdating((prev) => !prev);

    const cancelSubButton = async () => {
        const res = await fetch('/api/user/subscription/cancel', { method: 'POST' });
        if (res.ok) {
            alert('Subscription cancelled successfully');
            // No need to manually update state, context will refresh
        } else {
            alert('Failed to cancel subscription');
        }
    };

    if (subLoading) {
        return <div className='flex items-center justify-center h-[92vh] w-full border-b border-borderColor'>
            <div className='loader' />
        </div>;
    }

    const hasSubscription = !!subscription?.priceId;

    return (
        <div className='flex flex-col items-center justify-center h-[92vh] w-full gap-5  border-b border-borderColor'>
            {hasSubscription ? (
                <>
                    {!updating && (
                        <div className='flex flex-col text-center'>
                            <h1 className="mb-4">
                                Your Subscription
                            </h1>
                            <div className='text-sm w-xs mb-8'>
                                You are currently subscribed. You can edit or cancel your subscription at any time.
                            </div>
                            <button
                                onClick={cancelSubButton}
                                className="formBlackButton mb-1"
                            >
                                Cancel Subscription
                            </button>
                            <button
                                onClick={updateSubButton}
                                className="formBlackButton"
                            >
                                Edit Subscription
                            </button>
                        </div>
                    )}
                    {updating && (
                        <Elements stripe={stripePromise}>
                            <SubscriptionDetails />
                        </Elements>
                    )}
                </>
            ) : (
                <>
                    {!updating && (
                        <div className='flex flex-col gap-4 text-center'>
                            <h1 className="">No Subscription?</h1>
                            <div className='text-sm w-xs mb-2'>
                                You are currently on the free tier. Upgrade to access premium features.
                            </div>
                            <button
                                onClick={updateSubButton}
                                className="formBlackButton"
                            >
                                Sign Up for Subscription
                            </button>
                        </div>
                    )}

                    {updating && (
                        <Elements stripe={stripePromise}>
                            <SubscriptionDetails />
                        </Elements>
                    )}
                </>
            )}
        </div>
    )
}

export default Subscription