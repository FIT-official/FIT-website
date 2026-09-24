'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckoutProvider, PaymentElement, useCheckout } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useUser } from "@clerk/nextjs";
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';
import DeliveryAddressPrompt from '@/components/Cart/DeliveryAddressPrompt';
import { ADD_ADDRESS_TO_PAY, addressesEqual, cartNeedsDeliveryAddress, deliveryMismatchReason, isAddressComplete } from '@/lib/checkoutAddressGate';

if (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY === undefined) {
    throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not defined');
}
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

const PayButton = ({ disabled, busy, reason, onRetry }) => (
    <div className="flex flex-col gap-2 mt-2">
        <button
            disabled={disabled}
            type="submit"
            className="px-6 py-3 bg-textColor text-white rounded hover:bg-lightColor disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-textColor"
        >
            {busy ? <div className="spinner"></div> : 'Pay Now'}
        </button>
        {reason && (
            <p data-testid="pay-blocked-reason" className="text-xs text-lightColor">{reason}</p>
        )}
        {onRetry && (
            <button
                type="button"
                onClick={onRetry}
                className="self-start text-sm font-medium text-textColor underline underline-offset-4 hover:text-lightColor"
            >
                Retry
            </button>
        )}
    </div>
);

const CheckoutForm = ({ canPay, blockedReason }) => {
    const checkout = useCheckout();
    const { user, isLoaded } = useUser();
    const [message, setMessage] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isLoaded || !user || !canPay) {
            return;
        }
        setIsLoading(true);
        const confirmResult = await checkout.confirm();
        if (confirmResult.type === 'error') {
            setMessage(confirmResult.error.message);
        } else if (confirmResult.type === 'success' && confirmResult.sessionId) {
            posthog.capture('checkout_payment_submitted', { session_id: confirmResult.sessionId });
            // Redirect to return page with session_id
            router.push(`/checkout/return?session_id=${confirmResult.sessionId}`);
        }
        setIsLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <h4 className="font-semibold text-lg text-textColor">Payment</h4>
            <div className="border border-borderColor rounded bg-extraLight p-4">
                <PaymentElement id="payment-element" />
            </div>
            <PayButton disabled={isLoading || !canPay} busy={isLoading} reason={canPay ? null : blockedReason} />
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
                        {item.warning && (
                            <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 p-2 rounded mt-1">
                                {item.warning}
                            </div>
                        )}
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

const formatAddressLines = (address) => {
    if (!address) return [];
    return [
        [address.street, address.unitNumber].filter(Boolean).join(', '),
        [address.city, address.state, address.postalCode].filter(Boolean).join(' '),
        address.country,
    ].filter(Boolean);
};

/**
 * Delivery address panel, editable in place. Shows the saved address with an
 * Edit button, or the inline form when there is no complete address yet.
 */
const BillingInfo = ({ address, phone, needsAddress, editing, onEdit, onCancelEdit, onAddressSaved }) => {
    const complete = isAddressComplete(address);
    const showForm = editing || !complete;
    const lines = formatAddressLines(address);

    return (
        <div className="flex flex-col gap-4 border border-borderColor rounded bg-white p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="font-semibold text-lg text-textColor">Delivery address</h3>
                    {!needsAddress && (
                        <p className="text-xs text-lightColor mt-1">Nothing in this order ships, so an address is optional.</p>
                    )}
                </div>
                {complete && !editing && (
                    <button
                        type="button"
                        onClick={onEdit}
                        className="text-sm font-medium text-textColor underline underline-offset-4 hover:text-lightColor"
                    >
                        Edit
                    </button>
                )}
            </div>

            {showForm ? (
                <DeliveryAddressPrompt
                    initialAddress={address}
                    title={null}
                    saveLabel={complete ? 'Save changes' : 'Save delivery address'}
                    onCancel={complete ? onCancelEdit : undefined}
                    onAddressSaved={onAddressSaved}
                />
            ) : (
                <address data-testid="saved-address" className="not-italic text-sm text-textColor leading-relaxed">
                    {lines.map((line, i) => (
                        <div key={i}>{line}</div>
                    ))}
                </address>
            )}

            <div>
                <label className="text-xs text-lightColor">Phone</label>
                <div className="text-sm text-textColor">
                    {phone || <span className="text-lightColor">Not set</span>}
                </div>
            </div>
        </div>
    );
};

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
                <span data-testid="order-total" className="text-textColor">S${total.toFixed(2)}</span>
            </div>
        </div>
    );
};

const CheckOut = () => {
    const [clientSecret, setClientSecret] = useState(undefined);
    const [freeCheckout, setFreeCheckout] = useState(false);
    const [loading, setLoading] = useState(true);
    const [sessionLoading, setSessionLoading] = useState(false);
    const [cartBreakdown, setCartBreakdown] = useState([]);
    const [address, setAddress] = useState(null);
    const [phone, setPhone] = useState('');
    const [checkoutError, setCheckoutError] = useState('');
    const [editingAddress, setEditingAddress] = useState(false);
    const router = useRouter();

    const createSession = useCallback(async () => {
        setSessionLoading(true);
        setCheckoutError('');
        try {
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
                setClientSecret(undefined);
                setFreeCheckout(false);
                // The server keeps its 400 for a missing address; here it is an
                // inline reason under the Pay button, not an alert().
                setCheckoutError(errorMsg.toLowerCase().includes('missing delivery address') ? ADD_ADDRESS_TO_PAY : errorMsg);
                return;
            }
            const data = await res.json();
            setClientSecret(data.clientSecret);
            setFreeCheckout(data.free || false);
        } catch {
            setClientSecret(undefined);
            setCheckoutError('Could not start checkout. Please try again.');
        } finally {
            setSessionLoading(false);
        }
    }, []);

    useEffect(() => {
        const fetchBreakdown = async () => {
            const res = await fetch('/api/checkout/breakdown');
            if (res.ok) {
                const data = await res.json();
                setCartBreakdown(data.cartBreakdown || []);
                if (data.address) setAddress(data.address);
            } else {
                setCartBreakdown([]);
            }
        };

        const fetchContact = async () => {
            try {
                const [addressRes, phoneRes] = await Promise.all([
                    fetch('/api/user/contact/address'),
                    fetch('/api/user/contact/phone')
                ]);
                if (addressRes.ok) {
                    const data = await addressRes.json();
                    if (data.address) setAddress(data.address);
                }
                if (phoneRes.ok) {
                    const data = await phoneRes.json();
                    const p = data.phone || {};
                    setPhone(p.number ? `${p.countryCode} ${p.number}` : '');
                }
            } catch { }
        };

        const load = async () => {
            setLoading(true);
            await Promise.all([fetchBreakdown(), fetchContact(), createSession()]);
            setLoading(false);
        };
        load();
    }, [createSession]);

    const handleAddressSaved = async (saved) => {
        const unchanged = addressesEqual(saved, address);
        setAddress(saved);
        setEditingAddress(false);
        // The session was refused (or priced) without an address; recreate it
        // now that one exists so Stripe has the delivery details. Saving the
        // same address again with a live session changes nothing.
        if (unchanged && clientSecret) return;
        await createSession();
    };

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

    const needsAddress = cartNeedsDeliveryAddress(cartBreakdown);
    const addressOk = isAddressComplete(address);
    const addressBlocked = needsAddress && !addressOk;
    const mismatchReason = deliveryMismatchReason(cartBreakdown);
    const blockedReason = addressBlocked ? ADD_ADDRESS_TO_PAY : (mismatchReason || checkoutError || null);
    const canPay = Boolean(clientSecret) && !addressBlocked && !mismatchReason && !sessionLoading;
    // A session error that is not about the address can be retried in place.
    const retryable = !clientSecret && !sessionLoading && !addressBlocked && !mismatchReason && Boolean(checkoutError);

    return (
        <div className="min-h-[92vh] flex flex-col items-center p-12 border-b border-borderColor">
            <h1 className="text-3xl font-bold mb-4 text-textColor">Checkout</h1>
            <div className="text-xs text-lightColor mb-8 w-75 text-center">
                Please review your order and delivery details before proceeding with the payment.
            </div>
            <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex flex-col gap-8">
                    <BillingInfo
                        address={address}
                        phone={phone}
                        needsAddress={needsAddress}
                        editing={editingAddress}
                        onEdit={() => setEditingAddress(true)}
                        onCancelEdit={() => setEditingAddress(false)}
                        onAddressSaved={handleAddressSaved}
                    />
                </div>
                <div className="flex flex-col gap-8">
                    <OrderSummary cartBreakdown={cartBreakdown} />
                    {clientSecret
                        ? (
                            <CheckoutProvider key={clientSecret} stripe={stripePromise} options={{ fetchClientSecret: async () => clientSecret }}>
                                <CheckoutForm canPay={canPay} blockedReason={blockedReason} />
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
                            <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4">
                                <h4 className="font-semibold text-lg text-textColor">Payment</h4>
                                <PayButton
                                    disabled
                                    busy={sessionLoading}
                                    reason={sessionLoading ? null : (blockedReason || 'Unable to start checkout. Please try again.')}
                                    onRetry={retryable ? createSession : undefined}
                                />
                            </form>
                        )
                    }
                </div>
            </div>
        </div>
    );
};

export default CheckOut;
