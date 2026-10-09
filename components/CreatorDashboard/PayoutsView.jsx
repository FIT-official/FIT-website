'use client';
import { useEffect, useState } from 'react';
import DashboardFrame, { cardClass } from './DashboardFrame';
import ViewAsFilter from './ViewAsFilter';
import { payoutConfig } from '@/lib/creator/payoutConfig';
const money = cents => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(cents / 100);
const columns = [['grossCents', 'Gross'], ['stripeFeeCents', 'Stripe fee estimate'], ['platformFeeCents', 'FIT platform fee'], ['creatorNetCents', 'Creator net estimate']];
export default function PayoutsView({ initial, owner = false, fixture = false }) {
    const [data, setData] = useState(initial), [viewId, setViewId] = useState(''), [error, setError] = useState('');
    useEffect(() => {
        if (fixture) return;
        let active = true;
        async function refresh() {
            try {
                const response = await fetch(`/api/creator-dashboard/payouts${viewId ? `?viewId=${encodeURIComponent(viewId)}` : ''}`, { cache: 'no-store' });
                const next = await response.json(); if (!response.ok) throw new Error(next.error);
                if (active) { setData(next); setError(''); }
            } catch { if (active) setError('Payout estimates could not be refreshed.'); }
        }
        refresh(); const timer = setInterval(refresh, 30000);
        return () => { active = false; clearInterval(timer); };
    }, [fixture, viewId]);
    return <DashboardFrame title="Payouts" owner={owner} fixture={fixture}>
        <p className="cd-muted">A planning view of {owner ? 'all stores’' : 'your store’s'} sales and fees. Payments are not sent from this page.</p>
        {owner && <ViewAsFilter fixture={fixture} onChange={setViewId} />}
        <p className="cd-notice">PLACEHOLDER — Chairman to set: FIT platform fee {payoutConfig.platformBasisPoints / 100}%. Stripe fee estimate: {payoutConfig.stripeBasisPoints / 100}% + {money(payoutConfig.stripeFixedCents)} per sub-order.</p>
        {error && <p role="alert" className="cd-error-message">{error}</p>}
        <div className="cd-stats cd-payout-stats">{columns.map(([key, label]) => <div key={key} className={`${cardClass} cd-stat`}>{label}<strong>{money(data.totals[key])}</strong><span className="cd-muted">SGD · current rows</span></div>)}</div>
        <section className={cardClass}><h2>Sales by sub-order</h2><div className="cd-table-wrap"><table className="cd-table"><thead><tr><th>Sub-order</th>{owner && <th>Store</th>}{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
            <tbody>{data.rows.map(row => <tr key={row.subOrderId}><td>{row.itemNames}<div className="cd-muted">#{row.subOrderId.slice(-6)} · {row.status}{row.excluded ? ' · excluded' : ''}</div></td>{owner && <td data-label="Store"><code>{row.storeId}</code></td>}{columns.map(([key, label]) => <td key={key} data-label={label} className="cd-money">{money(row[key])}</td>)}</tr>)}</tbody></table></div>
            {!data.rows.length && <p className="cd-muted">No sales yet.</p>}
        </section>
        <p className="cd-muted">Gross covers item sales before fees; delivery, tax and discounts are excluded. Fees round to the nearest cent per sub-order, then totals sum the latest 200 rows. The fixed estimate applies to each sub-order and may differ from the actual checkout fee. Cancelled and refunded sales are excluded. Refund fees and partial refunds need reconciliation.</p>
    </DashboardFrame>;
}
