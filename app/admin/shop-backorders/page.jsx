'use client';
import { useEffect, useState } from 'react';
import StockAllocation from '@/components/Cart/StockAllocation';
import { storeJson } from '@/lib/storeRequest';
export default function BackordersPage() {
    const [data, setData] = useState({ orders: [] }), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    async function load(cursor = '') {
        setBusy(true); setError('');
        try { const next = await storeJson('/api/admin/shop-backorders' + (cursor ? `?cursor=${cursor}` : ''));
            setData(previous => ({ ...next, orders: cursor ? [...previous.orders, ...next.orders] : next.orders }));
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    }
    useEffect(() => { load(); }, []);
    async function allocate(event, order, item) {
        event.preventDefault(); setBusy(true); setError('');
        try {
            const quantity = Number(new FormData(event.currentTarget).get('quantity'));
            const next = await storeJson('/api/admin/shop-backorders', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: order.orderId, cartItemId: item.sourceCartItemId, quantity, expectedRevision: item.backorderFulfillment?.revision || 0 }) });
            setData(previous => ({ ...previous, orders: previous.orders.map(o => o.orderId === order.orderId
                ? { ...o, items: o.items.map(i => i.sourceCartItemId === item.sourceCartItemId ? { ...i, backorderFulfillment: next } : i) } : o) }));
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    }
    return <main className="p-6 max-w-5xl mx-auto space-y-5"><h1 className="text-2xl font-bold">Shop backorders</h1>
        <p>Record physically received stock in the existing inventory editor first. Allocating it here deducts only the available units and preserves the original order disclosure.</p>
        {error && <p role="alert">{error}</p>}
        <button onClick={() => load()} disabled={busy} className="underline">Refresh orders</button>
        {data.orders.map(order => <section key={order.orderId} className="border rounded p-4 space-y-3">
            <h2>{order.orderId} · {order.customerName} · {order.status}</h2>
            {order.items.filter(i => i.stockAllocation?.backorderQuantity > 0).map(item => {
                const remaining = item.stockAllocation.backorderQuantity - (item.backorderFulfillment?.allocated || 0);
                return <div key={item.sourceCartItemId} className="border-t pt-3"><h3>{item.productName} — {Object.values(item.selectedVariants || {}).join(', ')} × {item.quantity}</h3>
                    <StockAllocation allocation={item.stockAllocation} fulfillment={item.backorderFulfillment} />
                    {item.fulfillmentStatus && <p>Fulfillment status: {item.fulfillmentStatus.replaceAll('_', ' ')}</p>}
                    {remaining > 0 && item.currentRestockStatus === 'not_restocked' && <p role="status">This selection is now marked as not being restocked. Contact the customer to resolve the remaining units; no automatic message or refund has been sent.</p>}
                    {remaining > 0 && !['cancelled', 'refunded', 'partially_refunded'].includes(order.status) && !['cancelled', 'refunded', 'partially_refunded', 'review_required'].includes(item.fulfillmentStatus) && <form onSubmit={e => allocate(e, order, item)} className="flex flex-wrap gap-3 mt-2">
                        <label>Units received and available <input required name="quantity" type="number" min="1" max={remaining} step="1" defaultValue="1" className="border p-2 w-24" /></label>
                        <button disabled={busy} className="formBlackButton">Allocate received stock</button>
                    </form>}
                </div>;
            })}
        </section>)}
        {!data.orders.length && !busy && <p>No backorders to display.</p>}
        {data.nextCursor && <button disabled={busy} onClick={() => load(data.nextCursor)}>Load older orders</button>}
    </main>;
}
