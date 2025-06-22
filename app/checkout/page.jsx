'use client';

import React, { useEffect, useState } from 'react';
import { CheckoutProvider, PaymentElement, useCheckout } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useUser } from "@clerk/nextjs";

if (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY === undefined) {
    throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not defined');
}
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

const CheckoutForm = () => {
    const checkout = useCheckout();
    const { user, isLoaded } = useUser();
    const [message, setMessage] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isLoaded || !user) {
            return
        }

        setIsLoading(true);

        const confirmResult = await checkout.confirm();
        if (confirmResult.type === 'error') {
            setMessage(confirmResult.error.message);
        }
        setIsLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <h4>Payment</h4>
            <PaymentElement id="payment-element" />
            <button
                disabled={isLoading}
                type="submit"
                className="px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
                {isLoading ? <div className="spinner"></div> : 'Pay Now'}
            </button>
            {message && <div id="payment-message">{message}</div>}
        </form>
    );
};

const CartBreakdown = () => {
    const [cartBreakdown, setCartBreakdown] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchBreakdown = async () => {
            const res = await fetch('/api/checkout/breakdown');
            if (res.ok) {
                const data = await res.json();
                setCartBreakdown(data.cartBreakdown || []);
            }
            setLoading(false);
        };
        fetchBreakdown();
    }, []);

    if (loading) return <div>Loading cart details...</div>;
    if (!cartBreakdown.length) return <div>No items in cart.</div>;

    return (
        <div className="w-full max-w-xl mb-8">
            {cartBreakdown.map((item, idx) => (
                <div key={idx} className="border-b py-2 flex flex-col">
                    <div className="font-semibold">{item.name} x{item.quantity}</div>
                    <div className="text-sm text-gray-400">
                        Product: ${item.price.toFixed(2)}<br />
                        Delivery ({item.chosenDeliveryType}): ${item.deliveryFee.toFixed(2)}
                        {item.chosenDeliveryType === "singpost" && (
                            <span>
                                {" "} (Royalty: ${item.royaltyFee.toFixed(2)} + SingPost: ${item.singpostFee.toFixed(2)})
                            </span>
                        )}
                        <br />
                        <span className="font-bold">Total: ${(item.total).toFixed(2)}</span>
                    </div>
                </div>
            ))}
        </div>
    );
};

const CheckOut = () => {
    const fetchClientSecret = async () => {
        const res = await fetch('/api/checkout/session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        if (!res.ok) {
            let errorMsg = 'Failed to create checkout session';
            try {
                const data = await res.json();
                if (data?.error) errorMsg = data.error;
            } catch { }
            if (errorMsg.toLowerCase().includes('missing delivery address')) {
                alert('Please add a delivery address to your account before checking out.');
            }
            throw new Error(errorMsg);
        }
        const { clientSecret } = await res.json();
        return clientSecret;
    };

    const appearance = {
        theme: 'night',
        labels: 'floating',
    };

    const options = {
        fetchClientSecret,
    };

    return (
        <div className="flex h-screen w-screen">
            <div className="flex flex-col items-center justify-center w-full h-full">
                <h1 className="text-3xl font-bold mb-8 flex">Complete Your Payment</h1>
                {/* --- Cart Breakdown (separate from Stripe checkout) --- */}
                <CartBreakdown />
                {/* --- Stripe Checkout --- */}
                <CheckoutProvider stripe={stripePromise} options={options}>
                    <CheckoutForm />
                </CheckoutProvider>
            </div>
        </div>
    );
};

export default CheckOut;