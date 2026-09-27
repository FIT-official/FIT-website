'use client';
import { storeFetch } from '@/lib/storeRequest';
import { useRef, useState } from 'react';

export default function GuestContact({ onContinue }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const lock = useRef(false);
    async function submit(event) {
        event.preventDefault();
        if (lock.current) return;
        lock.current = true; setBusy(true); setError('');
        const data = Object.fromEntries(new FormData(event.currentTarget));
        const { name, email, ...address } = data;
        try {
            const res = await storeFetch('/api/user/cart/contact', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, address }) });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Unable to save your details. Please try again.');
            await onContinue({ ...address, name, email });
        } catch (err) { setError(err.message || 'Unable to connect. Please try again.'); }
        finally { lock.current = false; setBusy(false); }
    }
    return <form onSubmit={submit} className="flex flex-col gap-4 border rounded p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold">Guest checkout</h1>
        <p>Enter your receipt email and delivery address to continue to payment.</p>
        {[
            ['name', 'Full name', 'text', ''], ['email', 'Email', 'email', ''],
            ['street', 'Street address', 'text', ''], ['unitNumber', 'Unit number (optional)', 'text', ''],
            ['postalCode', 'Postal code', 'text', ''], ['city', 'City', 'text', 'Singapore'],
            ['state', 'State / region', 'text', 'Singapore'], ['country', 'Country code', 'text', 'SG'],
        ].map(([name, label, type, value]) => <label key={name}>{label}
            <input className="block border rounded p-2 w-full" name={name} type={type} defaultValue={value}
                required={name !== 'unitNumber'} maxLength={name === 'country' ? 2 : 200} pattern={name === 'country' ? '[A-Z]{2}' : undefined} disabled={busy} />
        </label>)}
        {error && <p role="alert">{error}</p>}
        <button className="formBlackButton justify-center" disabled={busy}>{busy ? 'Saving details…' : 'Continue to payment'}</button>
        <a href="/cart" className="underline">Back to cart</a>
    </form>;
}
