'use client';
import { useEffect, useState } from 'react';
export default function CartQuantityEditor({ quantity, disabled, onSave }) {
    const [value, setValue] = useState(String(quantity)), [error, setError] = useState(''), [saving, setSaving] = useState(false);
    useEffect(() => { setValue(String(quantity)); }, [quantity]);
    async function save() {
        const next = Number(value);
        if (!Number.isSafeInteger(next) || next < 1 || next > 100) { setError('Choose 1 to 100 whole units.'); return; }
        if (next === quantity) { setError(''); return; }
        setSaving(true); setError('');
        try { await onSave(next); } catch (e) { setError(e.message || 'Quantity could not be saved.'); }
        finally { setSaving(false); }
    }
    return <div><input aria-label="Cart quantity" className="min-h-11 w-11 min-w-11 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor" type="number" inputMode="numeric" min="1" max="100" step="1"
        value={value} disabled={disabled || saving} onChange={e => setValue(e.target.value)} onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
        {error && <p role="alert" className="text-xs">{error}</p>}</div>;
}
