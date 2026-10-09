'use client';
import { useEffect, useState } from 'react';
import DashboardFrame, { cardClass, buttonClass } from './DashboardFrame';
export default function MaterialsView({ initial, fixture = false }) {
    const [data, setData] = useState(initial), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    async function refresh() {
        setBusy(true); setError('');
        try { const res = await fetch('/api/creator-dashboard/materials', { cache: 'no-store' }); const body = await res.json(); if (!res.ok) throw new Error(body.error); setData(body); }
        catch { setError('Inventory is unavailable. The last result below may be outdated.'); } finally { setBusy(false); }
    }
    useEffect(() => { if (fixture) return; const timer = setInterval(refresh, 15 * 60000); return () => clearInterval(timer); }, [fixture]);
    return <DashboardFrame title="Materials" owner fixture={fixture}>
        <p className="cd-notice">Read-only inventory · {data.source === 'sheet' ? 'Google Sheet' : data.source === 'fixture' ? 'sample data' : 'dated local snapshot'} · checked {data.checkedAt}</p>
        <p className="cd-muted">Sheet quantities are shown as recorded. Spool mass and reserved grams are not inferred.</p><button className={buttonClass} disabled={fixture || busy} onClick={refresh}>{busy ? 'Refreshing…' : 'Refresh inventory'}</button>
        {error && <p className="cd-error-message" role="alert">{error}</p>}
        <section className={cardClass} style={{ marginTop: 20 }}><div className="cd-table-wrap"><table className="cd-table"><thead><tr><th>Material</th><th>Brand</th><th>Colour</th><th>SKU</th><th>Sheet quantity</th></tr></thead><tbody>{data.materials.map((item, index) => <tr key={`${item.sku}-${index}`}><td>{item.name}</td><td data-label="Brand">{item.brand}</td><td data-label="Colour">{item.colour}</td><td data-label="SKU">{item.sku}</td><td data-label="Sheet quantity">{item.sheetQuantity}</td></tr>)}</tbody></table></div></section>
        {!!data.issues.length && <section className={cardClass}><h2>Sync issues</h2><ul>{data.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></section>}
    </DashboardFrame>;
}
