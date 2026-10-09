'use client';
import { useEffect, useState } from 'react';
import DashboardFrame, { StatusBadge } from './DashboardFrame';
import { jobTransitions } from '@/lib/creatorDashboard/queueRules';
export default function QueueView({ initialJobs, printers = [], owner = true, fixture = false }) {
    const [jobs, setJobs] = useState(initialJobs), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const [name, setName] = useState(''), [qty, setQty] = useState(1);
    async function refresh() {
        const res = await fetch('/api/creator-dashboard/queue', { cache: 'no-store' }), data = await res.json();
        if (!res.ok) throw new Error(data.error); setJobs(data.jobs);
    }
    useEffect(() => {
        if (fixture) return;
        const timer = setInterval(() => refresh().catch(() => setError('Queue could not be refreshed.')), 4000);
        return () => clearInterval(timer);
    }, [fixture]);
    async function write(id, body) {
        setError(''); setBusy(true);
        try {
            const res = await fetch(`/api/creator-dashboard/queue${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await res.json(); if (!res.ok) throw new Error(data.error); await refresh();
        } catch (err) { setError(err.message); } finally { setBusy(false); }
    }
    return <DashboardFrame title={owner ? 'Print queue' : 'Print status'} owner={owner} fixture={fixture}>
        {owner && <><p className="cd-notice">Printer fleet: mock / manual list · no connection to physical printers</p><div className="cd-printers">{printers.map(printer => {
            const assigned = jobs.filter(job => job.printerId === printer._id && ['assigned', 'printing', 'qc'].includes(job.status));
            return <section key={printer._id} className="cd-printer"><h3>{printer.name}</h3><p className="cd-muted">{printer.model} · {printer.nozzleMm} mm nozzle</p>{assigned.length ? assigned.map(job => <p key={job._id}><StatusBadge status={job.status} /><br />{job.name}</p>) : <p className="cd-muted">No assigned job</p>}</section>;
        })}</div></>}
        {error && <p role="alert" className="cd-error-message">{error}</p>}
        <section className="cd-card" style={{ marginTop: 22 }}><h2>{owner ? 'Workshop jobs' : 'Your store’s print jobs'}</h2>
            {owner && <form className="cd-actions" onSubmit={e => { e.preventDefault(); write(null, { name, qty }); }} style={{ marginBottom: 20 }}><input required aria-label="Job name" placeholder="New job name" value={name} onChange={e => setName(e.target.value)} /><input aria-label="Quantity" type="number" min="1" max="10000" value={qty} onChange={e => setQty(Number(e.target.value))} style={{ width: 90 }} /><button disabled={fixture || busy}>Add job</button></form>}
            <div className="cd-table-wrap"><table className="cd-table"><thead><tr><th>Item / quantity</th>{owner && <><th>Priority / due</th><th>Printer</th></>}<th>Status</th>{owner && <th>Queue order</th>}</tr></thead><tbody>{jobs.map(job => <tr key={job._id}><td>{job.name}<div className="cd-muted">Quantity {job.qty}{owner && job.materialSku ? ` · ${job.materialSku}` : ''}</div>{owner && job.estMinutes ? <div className="cd-muted">Est. {job.estMinutes} min</div> : null}</td>
                {owner && <><td><select aria-label={`Priority for ${job.name}`} value={job.priority || 0} disabled={fixture || busy} onChange={e => write(job._id, { priority: Number(e.target.value) })}>{[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n === 0 ? 'Normal' : `Priority ${n}`}</option>)}</select><div style={{ marginTop: 6 }}><input type="date" aria-label={`Due date for ${job.name}`} value={job.dueAt?.slice(0,10) || ''} disabled={fixture || busy} onChange={e => write(job._id, { dueAt: e.target.value ? `${e.target.value}T04:00:00Z` : null })} /></div></td>
                <td><select aria-label={`Printer for ${job.name}`} value={job.printerId || ''} disabled={fixture || busy || !['queued', 'assigned'].includes(job.status)} onChange={e => write(job._id, { printerId: e.target.value })}><option value="">Unassigned</option>{printers.map(printer => <option key={printer._id} value={printer._id}>{printer.name}</option>)}</select></td></>}
                <td><StatusBadge status={job.status} />{owner && <div style={{ marginTop: 6 }}><select aria-label={`Status for ${job.name}`} value="" disabled={fixture || busy} onChange={e => { const status = e.target.value; if (!status) return; const reason = status === 'failed' ? window.prompt('Why did the print fail?') : ''; if (status !== 'failed' || reason) write(job._id, { status, reason }); }}><option value="">Next step</option>{(jobTransitions[job.status] || []).map(status => <option key={status} value={status}>{status}</option>)}</select></div>}</td>
                {owner && <td><div className="cd-actions"><button aria-label={`Move ${job.name} up`} disabled={fixture || busy} onClick={() => write(job._id, { direction: 'up' })}>↑</button><button aria-label={`Move ${job.name} down`} disabled={fixture || busy} onClick={() => write(job._id, { direction: 'down' })}>↓</button></div></td>}
            </tr>)}</tbody></table></div>{!jobs.length && <p>No print jobs yet.</p>}
        </section><p className="cd-muted">{owner ? 'Priority sorts first. Up and down move jobs within the same priority. Printer assignments and progress are entered manually.' : 'FIT manages printer assignment and production. This view shows only jobs linked to your orders.'}</p>
    </DashboardFrame>;
}
