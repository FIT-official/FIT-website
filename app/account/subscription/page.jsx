'use client'
import { useState } from 'react'
import { Elements } from '@stripe/react-stripe-js'
import SubscriptionDetails from '@/components/Account/SubscriptionDetails';
import { loadStripe } from '@stripe/stripe-js';

function Subscription() {
    const [updating, setUpdating] = useState(false);
    const options = {
        appearance: {
            theme: 'stripe',
        },
    }
    const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)

    const updateSubButton = () => {
        setUpdating((prev) => !prev);
    }

    const cancelSubButton = async () => {
        const res = await fetch('/api/user/subscription/cancel', {
            method: 'POST'
        });
        if (res.ok) {
            alert('Subscription cancelled successfully');
        } else {
            alert('Failed to cancel subscription');
        }
    }

    return (
        <div className='flex flex-col items-center justify-center h-screen w-screen gap-5'>
            <div className='flex flex-col gap-2 w-80'>
                <button onClick={cancelSubButton} className="mt-2 px-4 py-2 border rounded cursor-pointer">
                    Cancel Subscription
                </button>
            </div>
            <div className='flex flex-col gap-2 w-80'>
                <button onClick={updateSubButton} className="mt-2 px-4 py-2 border rounded cursor-pointer">
                    Edit Subscription
                </button>
            </div>
            {updating && (
                <Elements options={options} stripe={stripePromise}>
                    <SubscriptionDetails />
                </Elements>
            )}
        </div>
    )
}

export default Subscription