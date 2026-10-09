'use client';
import { useEffect, useState } from 'react';
import DashboardFrame, { StatusBadge } from './DashboardFrame';
import { transitions } from '@/lib/creatorDashboard/orderStatus';
export default function OrdersView({ initialOrders, owner = false, fixture = false, overview = false }) {
    const [orders, setOrders] = useState(initialOrders), [error, setError] = useState('');
    const [viewId, setViewId] = useState(''), [storeId, setStoreId] = useState('');
    useEffect(() => {
        if (fixture) return;
        let active = true;
        const refresh = async () => { try {
            const response = await fetch(`/api/orders${viewId ? `?viewId=${encodeURIComponent(viewId)}` : ''}`, { cache: 'no-store' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            if (active) setOrders(data.orders);
        } catch { if (active) setError('Orders could not be refreshed.'); } };
        refresh(); const timer = setInterval(refresh, 4000);
        return () => { active = false; clearInterval(timer); };
    }, [fixture, viewId]);
    async function change(id, status) {
        setError('');
        const res = await fetch(`/api/creator-dashboard/orders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
        const data = await res.json();
        if (!res.ok) return setError(data.error);
        setOrders(list => list.map(order => order._id === id ? data.order : order));
    }
    async function viewCreator(event) {
        event.preventDefault(); setError('');
        try {
            const res = await fetch('/api/creator-dashboard/view-as', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId }) });
            const data = await res.json(); if (!res.ok) throw new Error(data.error); setViewId(data.viewId);
        } catch (err) { setError(err.message); }
    }
    return <DashboardFrame title={overview ? 'Workshop overview' : 'Orders'} owner={owner} fixture={fixture}>
        <p className="cd-muted">{owner ? 'Follow fulfilment across all stores.' : 'Your store’s orders, from payment to delivery.'}</p>
        {owner && <form onSubmit={viewCreator} className="cd-actions"><input aria-label="Creator user ID" placeholder="Creator user ID" value={storeId} onChange={e => setStoreId(e.target.value)} /><button disabled={fixture || !storeId}>View as creator</button>{viewId && <button type="button" onClick={() => setViewId('')}>All stores</button>}</form>}
        {error && <p role="alert" className="cd-error-message">{error}</p>}
        <div className="cd-stats">
            <div className="cd-card cd-stat">Open orders<strong>{orders.filter(x => !['delivered', 'cancelled', 'refunded'].includes(x.status)).length}</strong><span className="cd-muted">Awaiting fulfilment</span></div>
            <div className="cd-card cd-stat">In production<strong>{orders.filter(x => x.status === 'in_production').length}</strong><span className="cd-muted">With the workshop</span></div>
            <div className="cd-card cd-stat">Quality check<strong>{orders.filter(x => x.status === 'qc').length}</strong><span className="cd-muted">Before dispatch</span></div>
        </div>
        <section className="cd-card"><span className="cd-poll">{fixture ? 'Sample orders' : 'Refreshes every 4 seconds'}</span><h2>Recent orders</h2>
            {!orders.length ? <p>No orders yet. Paid orders will appear here.</p> : <div className="cd-table-wrap"><table className="cd-table"><thead><tr><th>Item</th>{owner && <th>Store</th>}<th>Quantity</th><th>Status</th><th>Fulfilment</th><th>Next step</th></tr></thead><tbody>{orders.map(order => <tr key={order._id}>
                <td>{order.items.map(item => item.name).join(', ')}<div className="cd-muted">{new Date(order.createdAt).toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore' })}</div></td>
                {owner && <td><code>{order.storeId}</code></td>}<td>{order.items.reduce((n, item) => n + item.qty, 0)}</td><td><StatusBadge status={order.status} /></td><td>{order.fulfilment === 'fit' ? 'FIT workshop' : 'Your store'}</td>
                <td>{owner || order.fulfilment === 'creator' ? <select aria-label={`Next status for ${order.items[0]?.name}`} value="" disabled={fixture} onChange={e => change(order._id, e.target.value).catch(() => setError('Status could not be updated.'))}><option value="">Choose status</option>{(transitions[order.status] || []).map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select> : <span className="cd-muted">Handled by FIT</span>}</td>
            </tr>)}</tbody></table></div>}
        </section>
    </DashboardFrame>;
}
