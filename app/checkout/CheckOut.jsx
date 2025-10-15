'use client';

import React, { useEffect, useState } from 'react';
import { CheckoutProvider, PaymentElement, useCheckout } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useUser } from "@clerk/nextjs";
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/General/ToastProvider';

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
            <h4 className="font-semibold text-lg text-textColor">Payment</h4>
            <div className="border border-borderColor rounded bg-extraLight p-4">
                <PaymentElement id="payment-element" />
            </div>
            <button
                disabled={isLoading}
                type="submit"
                className="px-6 py-3 bg-textColor text-white rounded hover:bg-lightColor disabled:opacity-50 mt-2"
            >
                {isLoading ? <div className="spinner"></div> : 'Pay Now'}
            </button>
            {message && <div id="payment-message" className="text-red-500">{message}</div>}
        </form>
    );
};

const CartBreakdown = ({ cartBreakdown }) => {
    if (!cartBreakdown.length) return <div className="text-lightColor text-sm">No items in cart.</div>;

    return (
        <div className="w-full flex flex-col divide-y divide-borderColor">
            {cartBreakdown.map((item, idx) => (
                <div key={idx} className="py-4 flex flex-col">
                    <div className="font-semibold text-textColor w-full justify-between flex text-sm items-center">
                        {item.name}
                        <span className="flex">x{item.quantity}</span>
                    </div>
                    <div className="flex flex-col gap-1 text-xs text-lightColor mt-1">
                        {/* Display variant options with fees */}
                        {item.variantInfo && item.variantInfo.length > 0 && (
                            <div className="text-textColor">
                                {item.variantInfo.map((v, i) => (
                                    <span key={i}>
                                        {v.option}
                                        {v.additionalFee > 0 && ` (+S$${v.additionalFee.toFixed(2)})`}
                                        {i < item.variantInfo.length - 1 && ", "}
                                    </span>
                                ))}
                            </div>
                        )}
                        {/* Price breakdown */}
                        <div className="text-lightColor">
                            Price: S${item.price.toFixed(2)}
                            {item.variantInfo && item.variantInfo.length > 0 && (
                                <span className="ml-1 text-xs">
                                    (Base: S${item.basePrice.toFixed(2)}
                                    {item.variantInfo.some(v => v.additionalFee > 0) && (
                                        <> + S${item.variantInfo.reduce((sum, v) => sum + v.additionalFee, 0).toFixed(2)}</>
                                    )}
                                    {item.priceBeforeDiscount > item.price && (
                                        <> - discount</>
                                    )}
                                    )
                                </span>
                            )}
                        </div>
                        <div className="text-lightColor">
                            Delivery ({item.chosenDeliveryType}): S${item.deliveryFee.toFixed(2)}
                            {item.chosenDeliveryType === "singpost" && (
                                <span>
                                    {" "}(Royalty: S${item.royaltyFee.toFixed(2)} + SingPost: S${item.singpostFee.toFixed(2)})
                                </span>
                            )}
                        </div>
                        {item.orderNote && (
                            <div className="text-xs text-textColor bg-extraLight p-2 rounded mt-2">
                                <span className="font-medium">Note:</span> {item.orderNote}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

const BillingInfo = ({ userContact }) => (
    <div className="flex flex-col gap-4 border border-borderColor rounded bg-white p-6">
        <h3 className="font-semibold text-lg mb-2 text-textColor">Billing Info</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="text-xs text-lightColor">Country</label>
                <input className="w-full border border-borderColor rounded px-3 py-2 bg-baseColor text-textColor" value={userContact?.country || ""} disabled />
            </div>
            <div>
                <label className="text-xs text-lightColor">Postal Code</label>
                <input className="w-full border border-borderColor rounded px-3 py-2 bg-baseColor text-textColor" value={userContact?.postalCode || ""} disabled />
            </div>
            <div>
                <label className="text-xs text-lightColor">City</label>
                <input className="w-full border border-borderColor rounded px-3 py-2 bg-baseColor text-textColor" value={userContact?.city || ""} disabled />
            </div>
            <div>
                <label className="text-xs text-lightColor">State</label>
                <input className="w-full border border-borderColor rounded px-3 py-2 bg-baseColor text-textColor" value={userContact?.state || ""} disabled />
            </div>
            <div className="md:col-span-2">
                <label className="text-xs text-lightColor">Street Address</label>
                <input className="w-full border border-borderColor rounded px-3 py-2 bg-baseColor text-textColor" value={userContact?.street || ""} disabled />
            </div>
            <div className="md:col-span-2">
                <label className="text-xs text-lightColor">Unit Number</label>
                <input className="w-full border border-borderColor rounded px-3 py-2 bg-baseColor text-textColor" value={userContact?.unitNumber || ""} disabled />
            </div>
            <div>
                <label className="text-xs text-lightColor">Phone</label>
                <input className="w-full border border-borderColor rounded px-3 py-2 bg-baseColor text-textColor" value={userContact?.phone || ""} disabled />
            </div>
        </div>
    </div>
);

const OrderSummary = ({ cartBreakdown }) => {
    // Subtotal: sum of all product prices × quantity
    const subtotal = cartBreakdown.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    // Delivery fees: sum of all deliveryFee * quantity (per item)
    const delivery = cartBreakdown.reduce((acc, item) => acc + ((item.deliveryFee || 0) * (item.quantity || 1)), 0);
    // Grand total: subtotal + delivery
    const total = subtotal + delivery;

    return (
        <div className="border border-borderColor rounded bg-white p-6 flex flex-col ">
            <h3 className="font-semibold text-lg text-textColor">
                Order Summary
            </h3>
            <CartBreakdown cartBreakdown={cartBreakdown} />
            <div className="flex justify-between text-base font-bold mt-4">
                <span className="text-textColor">Order Total</span>
                <span className="text-textColor">S${total.toFixed(2)}</span>
            </div>
        </div>
    );
};

const CheckOut = () => {
    const [clientSecret, setClientSecret] = useState(undefined);
    const [freeCheckout, setFreeCheckout] = useState(false);
    const [loading, setLoading] = useState(true);
    const [cartBreakdown, setCartBreakdown] = useState([]);
    const [userContact, setUserContact] = useState({});
    const router = useRouter();

    useEffect(() => {
        const fetchClientSecret = async () => {
            setLoading(true);
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
                setLoading(false);
                return;
            }
            const data = await res.json();
            setClientSecret(data.clientSecret);
            setFreeCheckout(data.free || false);
            setLoading(false);
        };

        const fetchBreakdown = async () => {
            const res = await fetch('/api/checkout/breakdown');
            if (res.ok) {
                const data = await res.json();
                setCartBreakdown(data.cartBreakdown || []);
            } else {
                setCartBreakdown([]);
            }
        };

        const fetchContact = async () => {
            let address = {};
            let phone = {};
            try {
                const [addressRes, phoneRes] = await Promise.all([
                    fetch('/api/user/contact/address'),
                    fetch('/api/user/contact/phone')
                ]);
                if (addressRes.ok) {
                    const data = await addressRes.json();
                    address = data.address || {};
                }
                if (phoneRes.ok) {
                    const data = await phoneRes.json();
                    phone = data.phone || {};
                }
            } catch { }
            setUserContact({
                ...address,
                phone: phone.number ? `${phone.countryCode} ${phone.number}` : ""
            });
        };

        fetchClientSecret();
        fetchBreakdown();
        fetchContact();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[92vh] border-b border-borderColor">
                <div className="loader" />
            </div>
        );
    }

    if (!cartBreakdown.length) {
        return (
            <div className="flex items-center justify-center min-h-[92vh]  border-b border-borderColor">
                <div className="border border-borderColor rounded-sm p-8 bg-white text-textColor text-lg font-medium">
                    Your cart is empty.
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[92vh] flex flex-col items-center p-12 border-b border-borderColor">
            <h1 className="text-3xl font-bold mb-4 text-textColor">Checkout</h1>
            <div className="text-xs text-lightColor mb-8 w-sm text-center">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
            </div>
            <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex flex-col gap-8">
                    <BillingInfo userContact={userContact} />
                </div>
                <div className="flex flex-col gap-8">
                    <OrderSummary cartBreakdown={cartBreakdown} />
                    {clientSecret
                        ? (
                            <CheckoutProvider stripe={stripePromise} options={{ fetchClientSecret: async () => clientSecret }}>
                                <CheckoutForm />
                            </CheckoutProvider>
                        )
                        : freeCheckout ? (
                            <button
                                className="px-6 py-3 bg-textColor text-white rounded hover:bg-lightColor"
                                onClick={() => router.push('/freebie/success')}
                            >
                                Confirm Purchase
                            </button>
                        ) : (
                            <div className="text-red-500">Unable to process checkout.</div>
                        )
                    }
                </div>
            </div>
        </div>
    );
};

export default CheckOut;