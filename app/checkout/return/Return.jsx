'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { storeJson } from '@/lib/storeRequest';
import { ConnectionNotice, StoreError, useStoreConnection } from '@/components/Cart/StoreFeedback';

export default function Return() {
    const sessionId = useSearchParams().get('session_id');
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const lock = useRef(false);
    const offline = useStoreConnection(() => check());
    async function check() {
        if (lock.current) return;
        if (!sessionId) { setError('This payment link is incomplete. Open checkout from your cart.'); setLoading(false); return; }
        lock.current = true; setLoading(true); setError('');
        try {
            const data = await storeJson('/api/checkout/session/' + encodeURIComponent(sessionId));
            if (!data.session?.status) throw new Error('Payment status is unavailable. Please check again.');
            setSession(data.session);
        } catch (err) { setError(err.message); }
        finally { lock.current = false; setLoading(false); }
    }
    // The session ID is the read identity; reconnect and retry call the latest check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { check(); }, [sessionId]);
    const paid = session?.payment_status === 'paid';
    const pending = session?.status === 'complete' && !paid;
    return <div className="min-h-[92vh] flex flex-col items-center justify-center p-8 border-b border-borderColor">
        <ConnectionNotice offline={offline} />
        <StoreError message={error} onRetry={sessionId ? check : undefined} busy={loading} />
        {loading && <p role="status">Checking payment status?</p>}
        {session && <div className="max-w-xl border rounded p-6 flex flex-col gap-4" role="status">
            <h1 className="text-2xl font-semibold">{paid ? 'Thank you for your order' : pending ? 'Payment is processing' : session.status === 'expired' ? 'Payment session expired' : 'Payment is incomplete'}</h1>
            <p>{paid ? 'Your payment was successful. This order is already paid; no further payment is needed. Confirmation may take a moment.' :
                pending ? 'Your payment has been submitted. Check again for confirmation before starting another payment.' :
                session.status === 'expired' ? 'This session can no longer take payment. Return to your cart to continue.' : 'You can return to the same checkout to complete payment.'}</p>
            {pending && <button className="underline" disabled={loading} onClick={check}>Check payment status</button>}
            {session.status === 'open' && !paid && <Link className="underline" href={session.attemptId ? '/checkout?attempt=' + encodeURIComponent(session.attemptId) : '/checkout'}>Return to checkout</Link>}
            {session.status === 'expired' && <Link className="underline" href="/cart">Back to cart</Link>}
            <Link className="underline" href="/shop">Continue shopping</Link>
        </div>}
    </div>;
}
