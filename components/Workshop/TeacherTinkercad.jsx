'use client'
import { useEffect, useRef, useState } from 'react'
import { classroomRequest } from './Classroom'
import { useClassPolling } from './useClassPolling'

const endpoint = '/api/admin/workshop/tinkercad'
export default function TeacherTinkercad() {
    const [open, setOpen] = useState(false), [view, setView] = useState(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [preview, setPreview] = useState(null), [selected, setSelected] = useState([]), [group, setGroup] = useState('all'), [mappingSearch, setMappingSearch] = useState('')
    const privateFile = useRef(null), privateText = useRef(null), alive = useRef(true), lock = useRef(false), fileSequence = useRef(0)
    useEffect(() => { const sequenceRef = fileSequence; alive.current = true; return () => { alive.current = false; sequenceRef.current++; privateFile.current = null } }, [])
    function clearPrivateData() { fileSequence.current++; privateFile.current = null; if (privateText.current) privateText.current.value = ''; setPreview(null) }
    async function refresh() { if (!open) return; try { const data = await classroomRequest(endpoint); if (alive.current) setView(data) } catch (error) { if (alive.current) { setView(null); setMessage(error.message) } return false } }
    useClassPolling(refresh, 'teacher-tinkercad:' + open)
    async function action(input) { if (lock.current) return; lock.current = true; setBusy(true); try { await classroomRequest(endpoint, 'PATCH', input); setSelected([]); await refresh(); setMessage('Saved. Student Tinkercad tabs update automatically.') } catch (error) { await refresh(); setMessage(error.message) } finally { lock.current = false; if (alive.current) setBusy(false) } }
    async function chooseFile(event) {
        const file = event.target.files?.[0]; event.target.value = ''; clearPrivateData(); const fileTicket = fileSequence.current
        if (!file || lock.current) return
        lock.current = true; setBusy(true)
        try { if (file.size > 50000) throw Error('Choose the private 75-seat JSON file.'); const data = JSON.parse(await file.text()); const result = await classroomRequest(endpoint + '/import', 'POST', { mode: 'preview', pool: data }); if (alive.current && fileTicket === fileSequence.current) { privateFile.current = data; setPreview(result); setMessage('Private file verified. Import remains paused until you select Import 75 seats.') } }
        catch (error) { if (alive.current && fileTicket === fileSequence.current) setMessage(error instanceof SyntaxError ? 'Choose a valid private JSON file.' : error.message) }
        finally { lock.current = false; if (alive.current) setBusy(false) }
    }
    async function previewPastedJson() {
        if (lock.current) return
        let text = privateText.current?.value || ''
        clearPrivateData(); const fileTicket = fileSequence.current
        lock.current = true; setBusy(true)
        try {
            if (!text.trim() || new TextEncoder().encode(text).length > 50000) throw Error('Paste the approved private 75-seat JSON, up to 50 KB.')
            const data = JSON.parse(text); text = ''
            const result = await classroomRequest(endpoint + '/import', 'POST', { mode: 'preview', pool: data })
            if (alive.current && fileTicket === fileSequence.current) { privateFile.current = data; setPreview(result); setMessage('Private JSON verified. Import remains paused until you select Import 75 seats.') }
        } catch (error) { if (alive.current && fileTicket === fileSequence.current) setMessage(error instanceof SyntaxError ? 'Paste valid private JSON from the approved file.' : error.message) }
        finally { text = ''; lock.current = false; if (alive.current) setBusy(false) }
    }
    async function importFile() {
        if (lock.current || !privateFile.current || !preview) return
        lock.current = true; setBusy(true)
        try { await classroomRequest(endpoint + '/import', 'POST', { mode: 'import', pool: privateFile.current, expectedFingerprint: preview.fingerprint }); clearPrivateData(); await refresh(); setMessage('The 75 seats are stored privately. New assignments are paused until you open them and approve sessions.') }
        catch (error) { setMessage(error.message) }
        finally { lock.current = false; if (alive.current) setBusy(false) }
    }
    const sessions = view?.sessions.filter(row => group === 'all' || row.group === group) || []
    const chosen = view?.sessions.filter(row => selected.includes(row.seat)).map(row => ({ seat: row.seat, expectedVersion: row.approvalVersion })) || []
    return <details className="border rounded-xl p-5 mt-6 ph-mask ph-no-capture" onToggle={event => { setOpen(event.currentTarget.open); if (!event.currentTarget.open) clearPrivateData() }}><summary className="cursor-pointer text-xl">Tinkercad assignments</summary>
        {open && <div className="mt-5"><p>Approve each joined class session before it can receive one private login. A refresh keeps its assignment; a new session needs a new approval and unused seat.</p><p role="status" aria-live="polite" className="mt-3">{message}</p>
            {view && !view.imported && <section className="border rounded-lg p-4 mt-4"><h3 className="text-lg font-semibold">Import the approved private pool</h3><p className="text-sm mt-2">Only the 75 new anonymous seats from the existing Friday class. Existing forty assignments stay unchanged.</p><label className="block mt-4">Private 75-seat JSON file<input type="file" accept=".json,application/json" className="block w-full mt-2" disabled={busy} onChange={chooseFile} /></label><div className="border-t mt-5 pt-4"><label className="block font-semibold" htmlFor="private-tinkercad-json">Or paste private 75-seat JSON</label><p id="private-tinkercad-json-help" className="text-sm mt-2">Paste the contents of the same approved file. The box clears when previewed. Nothing is imported until you select Import 75 seats.</p><textarea ref={privateText} id="private-tinkercad-json" aria-describedby="private-tinkercad-json-help" className="formInput block w-full mt-3 font-mono ph-mask ph-no-capture" rows={4} maxLength={50000} autoComplete="off" autoCorrect="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true" disabled={busy} onInput={() => { fileSequence.current++; privateFile.current = null; setPreview(null) }} /><div className="flex flex-wrap gap-2 mt-3"><button className="formWhiteButton" type="button" disabled={busy} onClick={previewPastedJson}>Preview private JSON</button><button className="formWhiteButton" type="button" disabled={busy} onClick={clearPrivateData}>Clear pasted JSON</button></div></div>{preview && <div className="mt-4"><p>Verified: {preview.seats} seats · {preview.className} · Safe Mode confirmed · {preview.originalAssignmentsPreserved} original assignments preserved.</p><button className="formBlackButton mt-3" type="button" disabled={busy} onClick={importFile}>Import 75 seats</button><button className="formWhiteButton mt-3 ml-2" type="button" disabled={busy} onClick={clearPrivateData}>Clear file</button></div>}</section>}
            {view?.imported && <><p className="font-semibold mt-4">{view.available} unused · {view.assigned} assigned · {view.total} total</p><button className="formWhiteButton mt-3" type="button" disabled={busy} aria-pressed={view.issuanceOpen} onClick={() => action({ action: 'issuance', open: !view.issuanceOpen, expectedVersion: view.configVersion })}>{view.issuanceOpen ? 'Pause new Tinkercad assignments' : 'Open new Tinkercad assignments'}</button><p className="text-sm mt-2">Pausing stops new assignments. Revoke a session below to stop it retrieving its existing login. A login already seen must also be revoked in Tinkercad if necessary.</p>
                <label className="block mt-5">Group<select className="formInput block mt-2" value={group} onChange={event => { setGroup(event.target.value); setSelected([]) }}><option value="all">All groups</option>{Array.from({ length: 10 }, (_, i) => <option key={i} value={'g' + (i + 1)}>Group {i + 1}</option>)}</select></label>
                <div className="flex flex-wrap gap-3 mt-4"><button type="button" className="formWhiteButton" disabled={busy || !sessions.length} onClick={() => setSelected(sessions.slice(0, 100).map(row => row.seat))}>Select shown sessions</button><button type="button" className="formBlackButton" disabled={busy || !chosen.length} onClick={() => action({ action: 'approval', approved: true, sessions: chosen })}>Approve selected</button><button type="button" className="formWhiteButton" disabled={busy || !chosen.length} onClick={() => action({ action: 'approval', approved: false, sessions: chosen })}>Revoke selected</button></div>
                <ul className="mt-4 space-y-2">{sessions.map((row, index) => <li className="border rounded-lg p-3" key={row.seat}><label className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={selected.includes(row.seat)} disabled={busy} onChange={event => setSelected(current => event.target.checked ? [...current, row.seat].slice(0, 100) : current.filter(seat => seat !== row.seat))} /><span><strong>{row.name}</strong> · Group {row.group.slice(1)}{sessions.filter(other => other.name === row.name && other.group === row.group).length > 1 ? ' · Session ' + (index + 1) : ''}<span className="block text-sm">{row.approved ? 'Approved' : 'Awaiting approval'}{row.assigned ? ' · Login reserved' : ''}</span></span></label></li>)}</ul>{!sessions.length && <p className="mt-4">No active student sessions in this group.</p>}
                <section className="mt-6 border-t pt-4"><h3 className="text-lg font-semibold">Assigned Tinkercad accounts</h3><p className="text-sm mt-2">Names are entered by students. Assignments stay recorded after their website session ends. Only account labels are shown here.</p><label className="block mt-3">Find student, group or Session ID<input className="formInput block w-full mt-2" value={mappingSearch} onChange={event => setMappingSearch(event.target.value)} /></label><ul className="space-y-3 mt-4">{(view.assignments || []).filter(row => [row.studentName, 'Group ' + row.group?.slice(1), row.seat, row.accountLabel, row.accountReference].join(' ').toLowerCase().includes(mappingSearch.trim().toLowerCase())).map(row => <li className="border rounded-lg p-3" key={row.seat}><strong>{row.studentName}</strong> — Group {row.group?.slice(1)}<p>{row.accountLabel} ({row.accountReference}) · {row.approved ? 'Approved' : 'Access revoked'}</p><details className="mt-2 text-sm"><summary>Session and assignment details</summary><p>Session ID: {row.seat.replace(/^guest_/, '')}</p><p>Assigned: {new Date(row.assignedAt).toLocaleString()}</p><p>Originally assigned to: {row.assignedName}, Group {row.assignedGroup?.slice(1)}</p></details></li>)}</ul>{!(view.assignments || []).length && <p className="mt-3">No account assignments yet.</p>}</section>
            </>}
        </div>}
    </details>
}
