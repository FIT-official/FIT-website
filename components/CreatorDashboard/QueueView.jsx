'use client';
import { useCallback, useEffect, useState } from 'react';
import DashboardFrame, { StatusBadge, cardClass, buttonClass } from './DashboardFrame';
import { PrinterCards } from './FleetView';
import ViewAsFilter from './ViewAsFilter';
import { jobTransitions } from '@/lib/creatorDashboard/queueRules';
export default function QueueView({ initialJobs, printers: initialPrinters = [], owner = true, fixture = false }) {
    const [jobs, setJobs] = useState(initialJobs), [printers, setPrinters] = useState(initialPrinters);
    const [error, setError] = useState(''), [busy, setBusy] = useState(false), [viewId, setViewId] = useState('');
    const [name, setName] = useState(''), [qty, setQty] = useState(1);
    const refresh = useCallback(async () => {
        const res = await fetch(`/api/creator-dashboard/queue${viewId ? `?viewId=${encodeURIComponent(viewId)}` : ''}`, { cache: 'no-store' }), data = await res.json();
        if (!res.ok) throw new Error(data.error); setJobs(data.jobs); setPrinters(data.printers);
    }, [viewId]);
    useEffect(() => {
        if (fixture) return;
        refresh().catch(() => setError('Queue could not be refreshed.'));
        const timer = setInterval(() => refresh().catch(() => setError('Queue could not be refreshed.')), 4000);
        return () => clearInterval(timer);
    }, [fixture, refresh]);
    async function write(id, body) {
        setError(''); setBusy(true);
        try {
            const res = await fetch(`/api/creator-dashboard/queue${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await res.json(); if (!res.ok) throw new Error(data.error); await refresh();
        } catch (err) { setError(err.message); } finally { setBusy(false); }
    }
    return <DashboardFrame title="Print queue" owner={owner} fixture={fixture}>
        <p className="cd-muted">Creators print their own orders on their own printers. Assign a job, then record its progress here.</p>
        {owner && <ViewAsFilter fixture={fixture} onChange={setViewId} />}
        <p className="cd-notice">Queue changes record production steps. They do not send commands to a printer.</p>
        {error && <p role="alert" className="cd-error-message">{error}</p>}
        <section className={cardClass}><h2>{owner ? 'Workshop jobs' : 'Your print jobs'}</h2>
            <form className="cd-actions" onSubmit={event => { event.preventDefault(); write(null, { name, qty }); }} style={{ marginBottom: 24 }}>
                <input className="formInput" required aria-label="Job name" placeholder="New job name" value={name} onChange={event => setName(event.target.value)} />
                <input className="formInput" aria-label="Quantity" type="number" min="1" max="10000" value={qty} onChange={event => setQty(Number(event.target.value))} style={{ maxWidth: 110 }} />
                <button className={buttonClass} disabled={fixture || busy || !!viewId}>Add job</button>
            </form>
            {viewId && <p className="cd-muted">Return to All stores to add a job to your own workshop.</p>}
            <div className="cd-table-wrap"><table className="cd-table"><thead><tr><th>Item / quantity</th><th>Priority / due</th><th>Printer</th><th>Status</th><th>Queue order</th></tr></thead><tbody>{jobs.map(job => <tr key={job._id}>
                <td>{job.name}<div className="cd-muted">Quantity {job.qty}{job.materialSku ? ` · ${job.materialSku}` : ''}</div>{job.estMinutes ? <div className="cd-muted">Est. {job.estMinutes} min</div> : null}{owner && <code>{job.storeId}</code>}</td>
                <td data-label="Priority / due"><div><select className="formInput" aria-label={`Priority for ${job.name}`} value={job.priority || 0} disabled={fixture || busy} onChange={event => write(job._id, { priority: Number(event.target.value) })}>{[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n === 0 ? 'Normal' : `Priority ${n}`}</option>)}</select><input className="formInput" style={{ marginTop: 8 }} type="date" aria-label={`Due date for ${job.name}`} value={job.dueAt?.slice(0,10) || ''} disabled={fixture || busy} onChange={event => write(job._id, { dueAt: event.target.value ? `${event.target.value}T04:00:00Z` : null })} /></div></td>
                <td data-label="Printer"><select className="formInput" aria-label={`Printer for ${job.name}`} value={job.printerId || ''} disabled={fixture || busy || !['queued', 'assigned'].includes(job.status)} onChange={event => write(job._id, { printerId: event.target.value })}><option value="" disabled>Unassigned</option>{printers.filter(printer => printer.storeId === job.storeId).map(printer => <option key={printer._id} value={printer._id}>{printer.name}</option>)}</select></td>
                <td data-label="Status"><div><StatusBadge status={job.status} /><select className="formInput" style={{ marginTop: 8 }} aria-label={`Status for ${job.name}`} value="" disabled={fixture || busy} onChange={event => { const status = event.target.value; if (!status) return; const reason = status === 'failed' ? window.prompt('Why did the print fail?') : ''; if (status !== 'failed' || reason) write(job._id, { status, reason }); }}><option value="">Next step</option>{(jobTransitions[job.status] || []).map(status => <option key={status} value={status}>{status}</option>)}</select></div></td>
                <td data-label="Queue order"><div className="cd-actions"><button className={buttonClass} aria-label={`Move ${job.name} up`} disabled={fixture || busy} onClick={() => write(job._id, { direction: 'up' })}>↑</button><button className={buttonClass} aria-label={`Move ${job.name} down`} disabled={fixture || busy} onClick={() => write(job._id, { direction: 'down' })}>↓</button></div></td>
            </tr>)}</tbody></table></div>{!jobs.length && <p>No print jobs yet.</p>}
        </section>
        <p className="cd-muted">Priority sorts first. Up and down move jobs within the same store and priority.</p>
        <h2 style={{ margin: '32px 0 24px' }}>Printer assignments</h2><PrinterCards printers={printers} jobs={jobs} owner={owner} />
    </DashboardFrame>;
}
