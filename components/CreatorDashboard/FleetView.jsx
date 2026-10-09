'use client';
import { useEffect, useState } from 'react';
import DashboardFrame, { cardClass, StatusBadge } from './DashboardFrame';
import ViewAsFilter from './ViewAsFilter';
const temperature = value => Number.isFinite(value) ? `${value} °C` : '—';
export function PrinterCards({ printers, jobs = [], owner = false }) {
    return <div className="cd-printers">{printers.map(printer => {
        const status = printer.telemetry, progress = status?.progress, temps = status?.temps;
        const assigned = jobs.filter(job => job.printerId === printer._id && ['assigned', 'printing', 'qc'].includes(job.status));
        return <section className={`${cardClass} cd-printer`} key={printer._id}>
            <h3>{printer.name}</h3><p className="cd-muted">{printer.model} · {printer.nozzleMm || '—'} mm nozzle</p>
            <StatusBadge status={status?.state || printer.status || 'unknown'} />
            {owner && <p className="cd-muted" style={{ marginTop: 12 }}>{printer.storeId}</p>}
            <progress aria-label={`${printer.name} progress`} max="100" value={progress?.percent ?? 0} />
            <p className="cd-muted">{progress?.percent == null ? 'Progress unavailable' : `${progress.percent}% complete`}</p>
            <dl><div><dt>Nozzle</dt><dd>{temperature(temps?.nozzles?.[0]?.current)}</dd></div><div><dt>Bed</dt><dd>{temperature(temps?.bed?.current)}</dd></div>
                <div><dt>Time left</dt><dd>{progress?.timeRemainingSec == null ? '—' : `${Math.ceil(progress.timeRemainingSec / 60)} min`}</dd></div><div><dt>Source</dt><dd>{printer.mode === 'mock' ? 'Mock' : printer.mode === 'manual' ? 'Manual' : 'FIT Bridge'}</dd></div></dl>
            {status?.errors?.map(error => <p className="cd-muted" key={error.code} style={{ marginTop: 16 }}>{error.code === 'bridge_not_connected' ? 'FIT Bridge is not connected.' : error.code.replaceAll('_', ' ')}</p>)}
            {assigned.map(job => <p key={job._id} style={{ marginTop: 16 }}><StatusBadge status={job.status} /><br />{job.name}</p>)}
            {!assigned.length && <p className="cd-muted" style={{ marginTop: 16 }}>No assigned job</p>}
        </section>;
    })}</div>;
}
export default function FleetView({ initialPrinters, initialJobs = [], owner = false, fixture = false }) {
    const [printers, setPrinters] = useState(initialPrinters), [viewId, setViewId] = useState(''), [error, setError] = useState('');
    const [jobs, setJobs] = useState(initialJobs);
    useEffect(() => {
        if (fixture) return;
        let active = true;
        async function refresh() {
            try {
                const response = await fetch(`/api/creator-dashboard/printers${viewId ? `?viewId=${encodeURIComponent(viewId)}` : ''}`, { cache: 'no-store' });
                const data = await response.json(); if (!response.ok) throw new Error(data.error);
                if (active) { setPrinters(data.printers); setJobs(data.jobs); setError(''); }
            } catch { if (active) setError('Fleet could not be refreshed. Status below may be outdated.'); }
        }
        refresh(); const timer = setInterval(refresh, 30000);
        return () => { active = false; clearInterval(timer); };
    }, [fixture, viewId]);
    return <DashboardFrame title="Printer fleet" owner={owner} fixture={fixture}>
        <p className="cd-muted">{owner ? 'Printers across all stores.' : 'The printers in your store.'} Mock cards show sample readings. FIT Bridge cards remain offline until a recent summary arrives.</p>
        {owner && <ViewAsFilter fixture={fixture} onChange={setViewId} />}
        <p className="cd-notice">Remote upload, start, pause and stop are unavailable. Printer controls stay with the creator.</p>
        {error && <p role="alert" className="cd-error-message">{error}</p>}
        <PrinterCards printers={printers} jobs={jobs} owner={owner} />
        {!printers.length && <section className={cardClass}><h2>No printers yet</h2><p className="cd-muted">Printers will appear after they are registered to this store.</p></section>}
    </DashboardFrame>;
}
