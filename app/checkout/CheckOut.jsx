'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckoutProvider, PaymentElement, useCheckout } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';
import GuestContact from '@/components/Cart/GuestContact';
import { storeJson, savedCheckoutAttempt, rememberCheckoutAttempt } from '@/lib/storeRequest';
import { ConnectionNotice, StoreError, useStoreConnection } from '@/components/Cart/StoreFeedback';

const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export const CheckoutForm = ({ sessionId, onCheckStatus, onReady, onLoadError }) => {
    const checkout = useCheckout();
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    const [elementReady, setElementReady] = useState(false);
    const lock = useRef(false);
    const offline = useStoreConnection(() => { if (uncertain) onCheckStatus(); });
    const router = useRouter();
    async function handleSubmit(e) {
        e.preventDefault();
        if (lock.current || offline || uncertain || !elementReady) return;
        lock.current = true; setIsLoading(true); setMessage('');
        let timer;
        try {
            // Check the existing session before every confirmation, including a
            // replay from browser history. Never create a payment here.
            const current = await storeJson('/api/checkout/session/' + encodeURIComponent(sessionId));
            if (current.session.payment_status === 'paid' || current.session.status === 'complete') {
                await onCheckStatus(); return;
            }
            if (current.session.status !== 'open') throw new Error('This payment session expired. Return to your cart.');
            const result = await Promise.race([checkout.confirm(), new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('Payment confirmation is taking longer than expected. Check payment status before trying again.')), 20000);
            })]);
            if (result.type === 'error') {
                // Some Stripe errors arrive after an uncertain network result.
                // Re-check server status before offering another submission.
                setUncertain(true); setMessage(result.error?.message || 'Payment could not be confirmed. Check payment status.');
            } else if (result.type === 'success') {
                setUncertain(true);
                try { posthog.capture('checkout_payment_submitted', { session_id: sessionId }); } catch {}
                router.push('/checkout/return?session_id=' + encodeURIComponent(result.sessionId || sessionId));
            } else { setUncertain(true); setMessage('Check payment status before trying again.'); }
        } catch (error) {
            setUncertain(true); setMessage(error.message || 'Connection interrupted. Check payment status before trying again.');
        } finally { clearTimeout(timer); lock.current = false; setIsLoading(false); }
    }
    return <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h4 className="font-semibold text-lg">Payment</h4>
        <ConnectionNotice offline={offline} />
        <div className="border border-borderColor rounded p-4"><PaymentElement id="payment-element"
            onReady={() => { setElementReady(true); onReady?.(); }}
            onLoadError={() => { setElementReady(false); onLoadError?.(); }} /></div>
        <button disabled={isLoading || offline || uncertain || !elementReady} type="submit" className="formBlackButton justify-center">
            {isLoading ? 'Processing payment...' : 'Pay Now'}
        </button>
        {message && <p role="alert">{message}</p>}
        {uncertain && <button type="button" className="underline" onClick={onCheckStatus}>Check payment status</button>}
    </form>;
};

const paymentLoadError = 'Payment controls could not load. Check your connection and try again.';

function PaymentControls({ stripe, data, onCheckStatus }) {
    const [ready, setReady] = useState(false);
    const [error, setError] = useState('');
    const active = useRef(true);
    useEffect(() => {
        active.current = true;
        return () => { active.current = false; };
    }, []);
    useEffect(() => {
        if (ready || error) return;
        const timer = setTimeout(() => setError(paymentLoadError), 15000);
        return () => clearTimeout(timer);
    }, [ready, error]);
    const guardedStripe = useMemo(() => new Proxy(stripe, {
        get(target, key) {
            if (key !== 'initCheckout') return Reflect.get(target, key, target);
            // The installed Stripe 3.x provider renders null during initialization
            // and does not handle rejected initCheckout promises. Keep recovery
            // outside the provider and consume failures without changing the SDK.
            return async options => {
                try { return await target.initCheckout(options); }
                catch {
                    if (active.current) setError(paymentLoadError);
                    return null;
                }
            };
        },
    }), [stripe]);
    return <div>
        {!ready && !error && <p role="status">Loading secure payment controls...</p>}
        <StoreError message={error} onRetry={onCheckStatus} />
        {!error && <CheckoutProvider stripe={guardedStripe} options={{ fetchClientSecret: async () => data.clientSecret }}>
            <CheckoutForm sessionId={data.sessionId} onCheckStatus={onCheckStatus}
                onReady={() => setReady(true)} onLoadError={() => setError(paymentLoadError)} />
        </CheckoutProvider>}
    </div>;
}

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
    const delivery = cartBreakdown.reduce((acc, item) => acc + (item.deliveryFee || 0), 0);
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
    const [data, setData] = useState(null);
    const [stripe, setStripe] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [needsGuestContact, setNeedsGuestContact] = useState(false);
    const [empty, setEmpty] = useState(false);
    const [paymentRevision, setPaymentRevision] = useState(0);
    const lock = useRef(false);
    const offline = useStoreConnection(() => { if (error) load(); });
    async function load() {
        if (lock.current) return;
        lock.current = true; setLoading(true); setError('');
        try {
            const cart = await storeJson('/api/user/cart');
            const attemptId = savedCheckoutAttempt() || cart.checkoutAttemptId;
            if (attemptId) rememberCheckoutAttempt(attemptId);
            if (!cart.cart?.length && !attemptId) { setEmpty(true); return; }
            // A new guest intent can already have an ID before contact saving.
            if (cart.guest && !cart.contactReady && cart.cart?.length) {
                setNeedsGuestContact(true); return;
            }
            setNeedsGuestContact(false);
            const result = await storeJson('/api/checkout/session', { method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(attemptId ? { 'X-Checkout-Attempt': attemptId } : {}) } }, 25000);
            rememberCheckoutAttempt(result.attemptId);
            setData(result); setEmpty(false); setPaymentRevision(v => v + 1);
            if (result.clientSecret && !result.alreadyPaid && !result.pending) {
                if (!stripeKey) throw new Error('Payment is temporarily unavailable. Please try again later.');
                let timer;
                try {
                    const loaded = await Promise.race([loadStripe(stripeKey), new Promise((_, reject) => {
                        timer = setTimeout(() => reject(new Error('Payment controls could not load. Check your connection and try again.')), 15000);
                    })]);
                    if (!loaded) throw new Error('Payment controls could not load. Please try again.');
                    setStripe(loaded);
                } finally { clearTimeout(timer); }
            }
        } catch (err) { setError(err.message); }
        finally { lock.current = false; setLoading(false); }
    }
    useEffect(() => { load(); }, []);
    return <div className="min-h-[92vh] p-6 md:p-12 border-b border-borderColor">
        <ConnectionNotice offline={offline} />
        <StoreError message={error} onRetry={load} busy={loading} />
        {loading && <p role="status">Checking your cart and payment status...</p>}
        {!loading && needsGuestContact && <GuestContact onContinue={load} />}
        {!loading && empty && <p>Your cart is empty. <a className="underline" href="/shop">Continue shopping</a></p>}
        {!loading && data && !needsGuestContact && <>
            <h1 className="text-3xl font-bold mb-4">Checkout</h1>
            {data.alreadyPaid || data.pending ? <div role="status" className="border rounded p-6">
                <h2 className="text-xl">{data.alreadyPaid ? 'Already paid' : 'Payment is processing'}</h2>
                <p>{data.alreadyPaid ? 'No further payment is needed. Order confirmation may take a moment.' : 'Please wait for confirmation before starting another payment.'}</p>
                <a className="underline" href={'/checkout/return?session_id=' + encodeURIComponent(data.sessionId)}>View payment status</a>
            </div> : <div className="max-w-6xl grid md:grid-cols-2 gap-8">
                <BillingInfo userContact={data.userContact} />
                <div className="flex flex-col gap-6">
                    <OrderSummary cartBreakdown={data.cartBreakdown || []} />
                    <p className="text-sm">Payment covers the order shown here. Return to your cart after this payment to buy any items added later.</p>
                    {!error && data.clientSecret && stripe ?
                        <PaymentControls key={paymentRevision} stripe={stripe} data={data} onCheckStatus={load} />
                        : !error && <StoreError message="Payment is temporarily unavailable. Please try again later." onRetry={load} />}
                </div>
            </div>}
        </>}
        <a className="underline block mt-6" href="/cart">Back to cart</a>
    </div>;
};

export default CheckOut;
