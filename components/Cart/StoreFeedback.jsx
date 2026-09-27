'use client';
import { useEffect, useRef, useState } from 'react';

export function useStoreConnection(onReconnect) {
    const [offline, setOffline] = useState(false);
    const callback = useRef(onReconnect);
    callback.current = onReconnect;
    useEffect(() => {
        setOffline(navigator.onLine === false);
        const online = () => { setOffline(false); callback.current?.(); };
        const offline = () => setOffline(true);
        window.addEventListener('online', online);
        window.addEventListener('offline', offline);
        return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
    }, []);
    return offline;
}

export function ConnectionNotice({ offline }) {
    return offline ? <p role="status" className="border rounded p-3 my-3">You are offline. Your saved cart will be available when you reconnect.</p> : null;
}

export function StoreError({ message, onRetry, busy = false }) {
    if (!message) return null;
    return <div role="alert" className="border rounded p-4 my-3">
        <p>{message}</p>
        <div className="flex gap-4 mt-2">
            {onRetry && <button type="button" className="underline" onClick={onRetry} disabled={busy}>{busy ? 'Trying again…' : 'Try again'}</button>}
            <a href="/cart" className="underline">Back to cart</a>
            <a href="/shop" className="underline">Continue shopping</a>
        </div>
    </div>;
}

export default function StoreBoundary({ reset }) {
    const offline = useStoreConnection(reset);
    return <div className="min-h-[60vh] px-8 py-16">
        <h1 className="text-2xl font-semibold">The shop could not load</h1>
        <ConnectionNotice offline={offline} />
        <StoreError message="Please check your connection and try again. Your saved cart is still available." onRetry={reset} />
    </div>;
}
