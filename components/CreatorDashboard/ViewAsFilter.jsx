'use client';
import { useState } from 'react';
import { buttonClass } from './DashboardFrame';
export default function ViewAsFilter({ fixture, onChange }) {
    const [storeId, setStoreId] = useState(''), [active, setActive] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    async function submit(event) {
        event.preventDefault(); setError(''); setBusy(true);
        try {
            const response = await fetch('/api/creator-dashboard/view-as', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId }) });
            const data = await response.json(); if (!response.ok) throw new Error(data.error);
            onChange(data.viewId); setActive(true);
        } catch (err) { setError(err.message); } finally { setBusy(false); }
    }
    return <><form className="cd-actions" onSubmit={submit}>
        <input className="formInput" aria-label="Creator user ID" placeholder="Creator user ID" value={storeId} onChange={event => setStoreId(event.target.value)} />
        <button className={buttonClass} disabled={fixture || busy || !storeId}>View as creator</button>
        {active && <button className={buttonClass} type="button" onClick={() => { onChange(''); setActive(false); }}>All stores</button>}
    </form>{error && <p role="alert" className="cd-error-message">{error}</p>}</>;
}
