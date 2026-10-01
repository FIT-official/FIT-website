'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGoogleMeasurement } from '@/components/General/GoogleMeasurementProvider';
import { openGoogleReview } from '@/lib/googleReviewClient';

export function GoogleReviewChoice({ review }) {
    const [state, setState] = useState('idle');
    const busy = useRef(false);
    const opened = useRef(false);
    const active = useRef(true);
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    const open = useCallback(async () => {
        if (busy.current || opened.current || !review) return;
        busy.current = true; setState('loading');
        try {
            const result = await openGoogleReview(review, undefined, undefined, { isActive: () => active.current });
            if (active.current) { opened.current = result; setState(result ? 'opened' : 'error'); }
        }
        catch { if (active.current) setState('error'); }
        finally { busy.current = false; }
    }, [review]);
    // The notice is already on screen before the SDK opens Google's own choice.
    // Offer the same module to every paid confirmation with verified fields.
    useEffect(() => { if (review) open(); }, [review, open]);
    if (!review) return null;
    return <section aria-labelledby="google-review-choice" className="border-t border-borderColor pt-4 flex flex-col gap-3 text-sm">
        <h2 id="google-review-choice" className="font-semibold">Google Customer Reviews</h2>
        <p>Google&apos;s survey choice sends Google your email, order ID, delivery country and estimated delivery date when it opens, even if you then decline the survey. Google emails you only if you opt in.</p>
        <p>Your answer does not affect your order. <Link href="/privacy#google-customer-reviews" className="underline">How these details are used</Link></p>
        {state === 'loading' && <p role="status">Opening Google&apos;s survey choice…</p>}
        {state === 'error' && <button type="button" className="self-start border border-borderColor rounded px-4 py-2" onClick={open}>Try Google survey choice again</button>}
        {state === 'error' && <p role="status">Google&apos;s survey choice could not load. You can try again; your order is unaffected.</p>}
        {state === 'opened' && <p role="status">Google&apos;s survey choice has opened. Your order does not depend on your answer.</p>}
    </section>;
}

export default function PaidOrderMeasurement({ sessionId }) {
    const [receipt, setReceipt] = useState(null);
    const { ready, dispatchPurchase } = useGoogleMeasurement();
    useEffect(() => {
        if (!/^cs_[a-zA-Z0-9_]{1,200}$/.test(sessionId || '')) return;
        const controller = new AbortController();
        let timer, attempts = 0;
        setReceipt(null);
        async function load() {
            attempts += 1;
            try {
                const response = await fetch(`/api/checkout/session/${encodeURIComponent(sessionId)}/measurement`,
                    { cache: 'no-store', signal: controller.signal });
                if (!response.ok) return;
                const data = await response.json();
                if (controller.signal.aborted) return;
                if (data.pending && attempts < 4) timer = setTimeout(load, 2000);
                else setReceipt(data);
            } catch { /* Optional measurement must never interrupt a paid receipt. */ }
        }
        load();
        return () => { controller.abort(); clearTimeout(timer); };
    }, [sessionId]);
    useEffect(() => {
        if (ready && receipt?.purchase) dispatchPurchase(receipt.purchase);
    }, [ready, receipt, dispatchPurchase]);
    return <GoogleReviewChoice key={sessionId} review={receipt?.review} />;
}
