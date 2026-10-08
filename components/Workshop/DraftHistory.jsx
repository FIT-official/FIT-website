'use client'
import { useState } from 'react'
export default function DraftHistory({ controls, disabled, status }) {
    const [selected, setSelected] = useState('')
    const rows = controls.remote?.snapshots || [], snapshot = rows.find(row => String(row.version) === selected)
    return <div className="ph-mask ph-no-capture border rounded-lg p-4 mt-4">
        <div className="flex gap-3"><button type="button" className="formWhiteButton" disabled={disabled || !controls.canUndo} onClick={controls.undo}>Undo draft edit</button><button type="button" className="formWhiteButton" disabled={disabled || !controls.canRedo} onClick={controls.redo}>Redo draft edit</button><button type="button" className="formWhiteButton" onClick={controls.compare}>Check saved draft history</button></div>
        <p role="status" aria-live="polite" className="mt-3">{status}</p>
        <button type="button" className="underline mt-2" disabled={disabled} onClick={controls.retry}>Retry draft recovery or autosave</button>
        <p className="text-sm mt-2">Draft snapshots save unfinished answers for recovery. Submit sends your finished response. Undo changes draft text; submitted receipts remain recorded.</p>
        {controls.conflict && <p role="alert" className="mt-3">Another tab or device has changed this draft. Your text is kept. Check saved history before continuing.</p>}
        {rows.length > 0 && <><label className="block mt-3">Saved draft versions<select className="formInput block w-full" value={selected} onChange={event => setSelected(event.target.value)}><option value="">Choose a version to compare</option>{rows.map(row => <option key={row.version} value={row.version}>Draft v{row.version} — {new Date(row.savedAt).toLocaleString()}</option>)}</select></label>{snapshot && <><pre className="whitespace-pre-wrap mt-3">{JSON.stringify(snapshot.content, null, 2)}</pre><button type="button" className="formWhiteButton mt-3" disabled={disabled} onClick={() => controls.rebase(snapshot.content)}>Restore this version as my draft</button></>}</>}
        {controls.conflict && <button type="button" className="formWhiteButton mt-3" disabled={disabled} onClick={() => controls.rebase()}>Keep my text using compared saved version</button>}
    </div>
}
