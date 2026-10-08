'use client'
import { useState } from 'react'
import Link from 'next/link'
import { classroomRequest } from './Classroom'
import TeacherResponses from './TeacherResponses'
import TeacherDraftRecovery from './TeacherDraftRecovery'
import { useClassPolling } from './useClassPolling'
export default function TeacherClassroom() {
    const [lesson, setLesson] = useState(null), [message, setMessage] = useState('Loading your protected classroom…'), [busy, setBusy] = useState(false), [edit, setEdit] = useState(null), [group, setGroup] = useState('all')
    const [privateRoster, setPrivateRoster] = useState(null), [rosterGroup, setRosterGroup] = useState('g1'), [rosterMessage, setRosterMessage] = useState('')
    async function refresh() { try { setLesson(await classroomRequest('/api/admin/workshop')); setMessage('') } catch (error) { setMessage(error.message); if ([401, 403].includes(error.status)) setLesson(null) } }
    useClassPolling(refresh, 'teacher-classroom')
    async function action(input) {
        if (busy) return false
        setBusy(true)
        try { await classroomRequest('/api/admin/workshop', 'PATCH', input); await refresh(); setMessage('Saved. Student screens update automatically.'); return true }
        catch (error) { setMessage(error.message); await refresh(); setMessage(error.message + ' Your unsaved edit is kept.'); return false }
        finally { setBusy(false) }
    }
    async function loadPrivateRoster(event) {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
        try {
            if (file.size > 32000) throw Error('Choose the private FIT student login JSON file.')
            const parsed = JSON.parse(await file.text()), rows = parsed.credentials
            if (!Array.isArray(rows) || rows.length !== lesson.accounts.length || new Set(rows.map(row => row.seat)).size !== lesson.accounts.length || rows.some(row => !lesson.accounts.some(account => account._id === row.seat && account.group === row.group) || typeof row.password !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(row.password))) throw Error('This roster does not match the currently provisioned student seats.')
            setPrivateRoster(rows.map(({ seat, group, password }) => ({ seat, group, password }))); setRosterMessage('Private roster loaded in this tab. Choose one group; clear it when finished.')
        } catch (error) { setRosterMessage(error instanceof SyntaxError ? 'Choose the private FIT login JSON file.' : error.message) }
    }
    if (!lesson) return <main className="max-w-4xl mx-auto p-8"><h1 className="text-3xl">Workshop teacher controls</h1><p role="status" className="mt-4">{message}</p><p className="mt-3">Sign in with your existing FIT admin account. Student accounts cannot open these controls.</p><Link href="/sign-in?redirect_url=%2Fadmin%2Fworkshop" className="underline">Sign in</Link></main>
    const settings = { feedbackOpen: lesson.feedbackOpen, refinementOpen: lesson.refinementOpen, showFeedback: lesson.showFeedback }
    return <main className="max-w-6xl mx-auto p-5 py-10 ph-no-capture ph-mask"><h1 className="text-3xl">Live workshop: teacher controls</h1><p className="mt-3">Updates automatically. Submissions are private to this classroom. Account passwords are delivered separately in your private handout.</p>
        <p role="status" aria-live="polite" className="mt-4">{message}</p>
        <section className="border rounded-xl p-5 mt-5"><h2 className="text-2xl">Active stage: {lesson.phase}</h2><div className="flex flex-wrap gap-3 mt-4">{['PRESENT', 'FEEDBACK', 'REFINE'].map(phase => <button key={phase} className="formWhiteButton" disabled={busy} aria-pressed={phase === lesson.phase} onClick={() => action({ action: 'phase', expectedVersion: lesson.version, phase, feedbackOpen: phase === 'FEEDBACK', refinementOpen: phase === 'REFINE', showFeedback: phase === 'REFINE' || lesson.showFeedback })}>{phase}</button>)}</div>
            <div className="flex flex-wrap gap-3 mt-4">{['feedbackOpen', 'refinementOpen', 'showFeedback'].map(key => <button key={key} className="formWhiteButton" disabled={busy || (key === 'feedbackOpen' && lesson.phase !== 'FEEDBACK') || (key === 'refinementOpen' && lesson.phase !== 'REFINE')} onClick={() => action({ action: 'phase', expectedVersion: lesson.version, phase: lesson.phase, ...settings, [key]: !lesson[key] })}>{key === 'showFeedback' ? 'Class feedback visibility' : key === 'feedbackOpen' ? 'Feedback submissions' : 'Refinement submissions'}: {lesson[key] ? 'open' : 'closed'}</button>)}</div>
        </section>
        <section className="border rounded-xl p-4 mt-4"><h2 className="text-xl">Assigned review round</h2><p className="mt-2">Round 1: next group (10 → 1). Round 2: two groups ahead. Close feedback before changing the assignment.</p><div className="flex flex-wrap gap-3 mt-3">{[1, 2].map(round => <button key={round} type="button" className="formWhiteButton" disabled={busy || lesson.feedbackOpen} aria-pressed={(lesson.reviewRound || 1) === round} onClick={() => action({ action: 'phase', expectedVersion: lesson.version, phase: lesson.phase, ...settings, reviewRound: round })}>Review round {round}</button>)}</div>{lesson.currentProjectVersion && lesson.currentProjectVersion !== lesson.projectVersion && <div className="mt-3"><p>The project content changed. Keep feedback closed and reconcile the reading version before starting another round.</p><button type="button" className="formWhiteButton mt-2" disabled={busy || lesson.feedbackOpen} onClick={() => action({ action: 'projectVersion', expectedVersion: lesson.version })}>Use reviewed current project version</button></div>}</section>
        <h2 className="text-2xl mt-8">Group progress</h2><div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">{lesson.progress.map(row => <article key={row.group} className="border p-4 rounded-lg"><h3>Group {row.group.slice(1)}</h3><p>Received: {row.received}</p><p>Submitted: {row.submitted}</p><p>Refinement: {row.refinementVersion ? 'revision ' + row.refinementVersion : 'not submitted'}</p></article>)}</div>
        <TeacherResponses lesson={lesson} busy={busy} onAction={action} />
        <TeacherDraftRecovery />
        <details className="mt-8"><summary>Student seats ({lesson.accounts.length} provisioned)</summary><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">{lesson.accounts.map(account => <article key={account._id} className="border rounded p-3"><p>{account._id} • Group {account.group.slice(1)}</p><p>{account.enabled ? 'Enabled' : 'Revoked'} • Expires {new Date(account.expiresAt).toLocaleString()}</p>{account.enabled && <button className="underline mt-2" disabled={busy} onClick={() => { if (window.confirm('Revoke only ' + account._id + '?')) action({ action: 'revoke', seat: account._id }) }}>Revoke this seat</button>}</article>)}</div>
        </details><details className="mt-5"><summary>Private group login handoff</summary><section className="border rounded-xl p-5 mt-5 ph-no-capture ph-mask"><h2 className="text-2xl">Private group login handoff</h2><p className="mt-3">Load your private forty-seat login JSON from Library. It stays in this browser tab and is not uploaded. Show only the selected group’s four cards so pupils can log in; no printing is required.</p><label className="block mt-4">Load private login roster<input type="file" accept=".json,application/json" className="block mt-2" onChange={loadPrivateRoster} /></label><label className="block mt-4">Reveal one group<select className="formInput block" value={rosterGroup} onChange={e => setRosterGroup(e.target.value)}>{Array.from({ length: 10 }, (_, i) => <option key={i} value={'g' + (i + 1)}>Group {i + 1}</option>)}</select></label>
            {privateRoster && <><div aria-label="Selected group login cards" className="grid sm:grid-cols-2 gap-3 mt-4">{privateRoster.filter(row => row.group === rosterGroup).map(row => { const account = lesson.accounts.find(a => a._id === row.seat), active = account?.enabled && Date.parse(account.expiresAt) > Date.now(); return <article key={row.seat} className="border rounded p-4"><h3>{row.seat}</h3><p>Website: /workshop/classroom</p>{active ? <p>Temporary password: <code className="break-all">{row.password}</code></p> : <p>Seat revoked or expired; do not distribute this login.</p>}<p>Tinkercad is separate. Each student sees only their own assigned instructions after signing in.</p></article> })}</div><button type="button" className="formWhiteButton mt-4" onClick={() => { setPrivateRoster(null); setRosterMessage('Private passwords cleared from this tab.') }}>Clear private roster</button></>}
            <p role="status" className="mt-3">{rosterMessage}</p>
        </section>
        </details><details className="mt-8"><summary>Teacher audit history ({lesson.audit.length})</summary>{lesson.audit.map((event, i) => <article key={i} className="border p-3 mt-2"><p>{event.at} • {event.actor} • {event.action} • {event.id}</p><pre className="whitespace-pre-wrap break-all">{JSON.stringify({ before: event.before, after: event.after }, null, 2)}</pre></article>)}</details>
    </main>
}
