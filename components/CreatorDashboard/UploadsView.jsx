'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import DashboardFrame, { StatusBadge, cardClass, buttonClass } from './DashboardFrame';
import StlPreview from './StlPreview';
const NOTICE = 'I own this design or have the right to have it printed. FIT uses it only to quote and fulfil this order and deletes it under the approved retention policy.';
export default function UploadsView({ fixture = false, owner = false, storageLabel, initialError = '' }) {
    const [files, setFiles] = useState([]), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false);
    const [error, setError] = useState(initialError), [uploads, setUploads] = useState([]), [preview, setPreview] = useState(null), [thumbnail, setThumbnail] = useState('');
    const [jobId, setJobId] = useState('');
    useEffect(() => {
        if (fixture) return;
        let active = true;
        fetch('/api/creator-dashboard/uploads').then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error); if (active) setUploads(data.uploads); }).catch(() => { if (active) setError('Uploads could not be loaded.'); });
        return () => { active = false; };
    }, [fixture]);
    async function jsonRequest(url, options) {
        const response = await fetch(url, options), data = await response.json(); if (!response.ok) throw new Error(data.error); return data;
    }
    async function upload(event) {
        event.preventDefault(); setError('');
        if (!consent) return setError('Confirm your right to print these files.');
        if (!files.length) return setError('Choose at least one STL, 3MF or STEP file.');
        if (fixture) return;
        setBusy(true);
        try {
            const result = await jsonRequest('/api/creator-dashboard/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: files.map(file => ({ filename: file.name, sizeBytes: file.size })), ipConsent: consent, ...(jobId ? { jobId } : {}) }) });
            setJobId(result.jobId);
            for (let i = 0; i < files.length; i++) {
                const item = result.uploads[i], file = files[i];
                let response;
                if (result.storage === 'mock') response = await fetch(item.post.url, { method: 'PUT', headers: { 'Content-Type': item.ext === '3mf' ? 'model/3mf' : item.ext === 'stl' ? 'model/stl' : 'model/step' }, body: file });
                else {
                    const form = new FormData(); for (const [key, value] of Object.entries(item.post.fields)) form.append(key, value); form.append('file', file);
                    response = await fetch(item.post.url, { method: 'POST', body: form });
                }
                if (!response.ok) throw new Error('File transfer failed. Start a new job to retry.');
                const completed = await jsonRequest(`/api/creator-dashboard/uploads/${item.uploadId}`, { method: 'POST' });
                setUploads(list => [completed.upload, ...list]);
                if (completed.validationError) setError(completed.validationError);
                if (completed.upload.scanStatus === 'clean' && item.ext === 'stl' && file.size <= 10 * 1024 * 1024) setPreview(file);
                if (completed.upload.scanStatus === 'clean' && item.ext === '3mf') {
                    try { const image = await jsonRequest(`/api/creator-dashboard/uploads/${item.uploadId}?thumbnail=true`); setThumbnail(image.url); } catch { /* No embedded preview. */ }
                }
            }
        } catch (err) { setError(err.message); } finally { setBusy(false); }
    }
    async function download(id) {
        try { const data = await jsonRequest(`/api/creator-dashboard/uploads/${id}`); window.location.assign(data.url); } catch (err) { setError(err.message); }
    }
    return <DashboardFrame title="Print files" owner={owner} fixture={fixture}>
        <p className="cd-notice">{storageLabel}</p><div className="cd-grid"><section className={cardClass}><h2>Upload a design</h2>
            <p className="cd-muted">STL and 3MF up to 100 MB · STEP up to 50 MB<br />Up to 10 files and 300 MB per job. Mock transfers are limited to 3 MB per file.</p>
            <form onSubmit={upload}><div className="cd-upload-zone"><label><span>Choose print files</span><input className="formInput" type="file" accept=".stl,.3mf,.step,.stp" multiple onChange={e => setFiles([...e.target.files])} disabled={busy} /></label><p className="cd-muted">Files stay private while their format and signature are checked.</p></div>
                <label className="cd-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>{NOTICE}</span></label>
                <p className="cd-muted">For listing designs, you must also hold commercial sale rights. Takedown enquiries: <a href="mailto:fixittoday.contact@gmail.com">fixittoday.contact@gmail.com</a>.</p>
                {error && <p className="cd-error-message" role="alert">{error}</p>}
                <div className="cd-actions"><button className={buttonClass} disabled={busy || fixture}>{busy ? 'Checking files…' : 'Upload files'}</button>{jobId && <button className={buttonClass} type="button" onClick={() => setJobId('')}>Start new job</button>}</div>
            </form>
        </section><aside className={cardClass}><h2>Before printing</h2><p>STEP files need conversion in Bambu Studio.</p><p className="cd-muted">Virus check: EICAR signature stand-in. Full ClamAV scanning will run on the FIT Bridge.</p><p className="cd-muted">Volume assumes STL coordinates in millimetres and a closed, consistently oriented mesh. Open meshes can give an inaccurate volume.</p><p className="cd-muted">Storage deletion schedules need bucket approval. Downloads expire after ten minutes.</p></aside></div>
        {preview && <section className={cardClass}><h2>Model preview</h2><StlPreview file={preview} /></section>}
        {thumbnail && <section className={cardClass}><h2>Embedded plate preview</h2><Image src={thumbnail} alt="Embedded 3MF plate" width={500} height={300} unoptimized style={{ maxWidth: 500, width: '100%', height: 'auto' }} /></section>}
        {uploads.length > 0 && <section className={cardClass}><h2>Your files</h2><div className="cd-table-wrap"><table className="cd-table"><thead><tr><th>File</th><th>Check</th><th>Geometry</th><th>Download</th></tr></thead><tbody>{uploads.map(item => <tr key={item.uploadId}><td>{item.filename}<div className="cd-muted">{(item.sizeBytes / 1024 / 1024).toFixed(2)} MB</div></td><td data-label="Check"><StatusBadge status={item.scanStatus} />{item.needsConversion && <p className="cd-muted">Needs conversion</p>}</td><td data-label="Geometry">{item.bbox ? `${item.bbox.x.toFixed(1)} × ${item.bbox.y.toFixed(1)} × ${item.bbox.z.toFixed(1)} mm; ${item.volumeCm3.toFixed(2)} cm³` : '—'}</td><td data-label="Download"><button className={buttonClass} disabled={fixture || item.scanStatus !== 'clean'} onClick={() => download(item.uploadId)}>Download</button></td></tr>)}</tbody></table></div></section>}
    </DashboardFrame>;
}
