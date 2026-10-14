'use client';
import { useEffect, useState } from 'react';
import StockAllocation from './StockAllocation';
import { useStoreConnection } from './StoreFeedback';
import { selectedAvailability } from '@/lib/shopBackorders/policy';
export default function ShopQuantity({ product, variants, quantity, onChange, disabled, onAvailability }) {
    const [result, setResult] = useState(null);
    const offline = useStoreConnection();
    const signature = JSON.stringify(variants || {});
    useEffect(() => {
        const controller = new AbortController();
        setResult(null); onAvailability?.(null);
        if (offline || navigator.onLine === false || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) return () => controller.abort();
        const params = new URLSearchParams({ productId: product._id, variants: signature, quantity: String(quantity || 1) });
        fetch(`/api/shop/availability?${params}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
            if (!response.ok) throw Error('Check current availability in your cart.');
            const data = await response.json();
            if (!controller.signal.aborted) { setResult(data); onAvailability?.(data); }
        }).catch(error => { if (!controller.signal.aborted) setResult({ error: error.message }); });
        return () => controller.abort();
    }, [product._id, signature, quantity, onAvailability, offline]);
    let recorded;
    try { recorded = selectedAvailability(product, variants); } catch { recorded = { available: null }; }
    return <div className="space-y-2">
        <label className="text-sm block">Quantity
            <input aria-label={`${product.name} quantity`} type="number" inputMode="numeric" min="1" max="100" step="1"
                value={quantity} disabled={disabled} onChange={event => onChange(event.target.value === '' ? '' : Number(event.target.value))}
                className="border rounded p-2 w-24 ml-2" />
        </label>
        {result?.allocation ? <StockAllocation allocation={result.allocation} />
            : <p className="text-sm">Recorded stock: {recorded.available ?? 'unconfirmed'}. Availability is checked again before payment.</p>}
        {result?.error && <p className="text-sm">{result.error}</p>}
    </div>;
}
