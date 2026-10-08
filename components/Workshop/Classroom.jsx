'use client'
import { useEffect, useRef, useState } from 'react'
import { workshopGroups, workshopGroupPage } from '@/lib/workshopPages'
import ReviewedGroupPage from './ReviewedGroupPage'
import { WORKSHOP_SESSION } from '@/lib/workshopFeedback'
const labels = { whatWorks: 'What works well, and why?', question: 'What question would you ask the presenters?', improvement: 'What specific improvement do you suggest?' }
const revisionLabels = { feedbackUsed: 'Which feedback are you using?', change: 'What will you change?', reason: 'Why will this improve the idea?', test: 'How will you test the change?' }
export async function classroomRequest(url, method = 'GET', body) {
    const response = await fetch(url, { method, cache: 'no-store', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
    const result = await response.json()
    if (!response.ok) throw Object.assign(Error(result.error || 'Unable to save.'), { status: response.status })
    return result
}
function useLocalDraft(key, create) {
    const [draft, setDraft] = useState(null), [warning, setWarning] = useState('')
    const factory = useRef(create); factory.current = create
    useEffect(() => {
        try { const stored = localStorage.getItem(key); setDraft(stored ? JSON.parse(stored) : factory.current()) }
        catch { setDraft(factory.current()); setWarning('This browser could not restore the draft. Keep this page open until your server submission is confirmed.') }
    }, [key]) // The key defines the seat/group draft; polling never replaces it.
    function save(next) { setDraft(next); try { localStorage.setItem(key, JSON.stringify(next)); setWarning('') } catch { setWarning('Draft is in this page only; browser saving is unavailable.') } }
    return [draft, save, warning]
}
function FeedbackForm({ group, lesson, onRefresh }) {
    const key = 'fit:class:' + WORKSHOP_SESSION + ':' + lesson.seat + ':feedback:' + group.id
    const [draft, save, warning] = useLocalDraft(key, () => ({ id: crypto.randomUUID(), idea: '', whatWorks: '', question: '', improvement: '', receipt: null, pending: false, payload: null }))
    const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), lock = useRef(false)
    if (!draft) return <p>Loading this project’s draft…</p>
    const allowed = lesson.phase === 'FEEDBACK' && lesson.feedbackOpen, own = group.id === lesson.group
    async function submit(event) {
        event.preventDefault(); if (lock.current || own || (!allowed && !draft.pending)) return
        const payload = draft.payload || { kind: 'feedback', submissionId: draft.id, session: WORKSHOP_SESSION, phaseVersion: lesson.phaseVersion, presentingGroup: group.id, visitingGroup: lesson.group, idea: draft.idea, ...Object.fromEntries(Object.keys(labels).map(k => [k, draft[k]])) }
        lock.current = true; setBusy(true); save({ ...draft, pending: true, payload }); setMessage('Submitting…')
        try { const receipt = await classroomRequest('/api/workshop/classroom', 'POST', payload); save({ ...draft, pending: false, payload, receipt }); setMessage('Submitted. Receipt ' + receipt.receipt + '. Your teacher can see this feedback.'); onRefresh() }
        catch (error) { setMessage(error.message); if (error.status && error.status < 500) save({ ...draft, id: crypto.randomUUID(), pending: false, payload: null }); onRefresh() }
        finally { lock.current = false; setBusy(false) }
    }
    if (own) return <p className="p-5 border rounded-xl">This is your presenting group. Visit another project to give feedback.</p>
    return <form className="ph-no-capture ph-mask border rounded-xl p-5 mt-5" onSubmit={submit} aria-label={'Feedback for Group ' + group.number}>
        <h3 className="text-xl">Group {group.number}: visitor feedback</h3><p className="text-sm mt-2">Submitting as {lesson.seat} (visiting Group {lesson.group.slice(1)}). Use group labels, not names or contact details.</p>
        <fieldset disabled={busy || draft.pending || Boolean(draft.receipt)}>
            <label className="block mt-4">Choose the idea<select required value={draft.idea} onChange={e => save({ ...draft, idea: e.target.value })} className="formInput block w-full"><option value="">Choose…</option>{group.ideas.map((idea, i) => <option key={idea.title} value={String(i + 1)}>Idea {i + 1}: {idea.title}</option>)}</select></label>
            {Object.entries(labels).map(([key, label]) => <label key={key} className="block mt-4">{label}<textarea aria-label={label} required maxLength={600} rows={3} value={draft[key]} onChange={e => save({ ...draft, [key]: e.target.value })} className="formInput block w-full" /></label>)}
        </fieldset>
        {!draft.receipt && <button className="formBlackButton mt-4" disabled={busy || (!allowed && !draft.pending)} type="submit">{busy ? 'Submitting…' : draft.pending ? 'Retry submit' : 'Submit'}</button>}
        {draft.receipt && <><p className="mt-4">Submitted • Receipt {draft.receipt.receipt}</p><button type="button" className="formWhiteButton mt-3" onClick={() => { save({ id: crypto.randomUUID(), idea: '', whatWorks: '', question: '', improvement: '', receipt: null, pending: false, payload: null }); setMessage('') }}>Write new feedback</button></>}
        {!allowed && <p className="mt-3">The teacher has closed feedback submission. Your draft stays here.</p>}
        <p role="status" aria-live="polite" className="mt-3">{message || warning || 'Draft saves on this browser. Click Submit to send it to your teacher.'}</p>
    </form>
}
function RefinementForm({ lesson, onRefresh }) {
    const group = workshopGroupPage(lesson.group), latest = lesson.refinements.filter(r => r.group === lesson.group).at(-1)
    const latestVersion = lesson.refinementVersion ?? latest?.version ?? 0, latestEntryVersion = lesson.refinementEntryVersion ?? (latest ? latest.entryVersion || 1 : 0)
    const [draft, save, warning] = useLocalDraft('fit:class:' + WORKSHOP_SESSION + ':' + lesson.seat + ':refinement', () => ({ id: crypto.randomUUID(), expectedVersion: latestVersion, expectedEntryVersion: latestEntryVersion, ideas: [0, 1].map(() => ({ feedbackUsed: '', change: '', reason: '', test: '' })), pending: false, payload: null, receipt: null }))
    const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), lock = useRef(false)
    if (!draft) return <p>Loading your refinement draft…</p>
    const allowed = lesson.phase === 'REFINE' && lesson.refinementOpen
    const draftEntryVersion = draft.expectedEntryVersion ?? (draft.expectedVersion ? 1 : 0), changed = draft.expectedVersion !== latestVersion || draftEntryVersion !== latestEntryVersion
    async function submit(event) {
        event.preventDefault(); if (lock.current || (!allowed && !draft.pending)) return
        const payload = draft.payload || { kind: 'refinement', submissionId: draft.id, phaseVersion: lesson.phaseVersion, expectedVersion: draft.expectedVersion, expectedEntryVersion: draftEntryVersion, ideas: draft.ideas }
        lock.current = true; setBusy(true); save({ ...draft, pending: true, payload }); setMessage('Submitting…')
        try { const receipt = await classroomRequest('/api/workshop/classroom', 'POST', payload); save({ ...draft, pending: false, payload, receipt }); setMessage('Both ideas submitted. Revision ' + receipt.version + ' • Receipt ' + receipt.receipt); onRefresh() }
        catch (error) { setMessage(error.message); if (error.status && error.status < 500) save({ ...draft, id: crypto.randomUUID(), pending: false, payload: null }); onRefresh() }
        finally { lock.current = false; setBusy(false) }
    }
    return <section className="ph-no-capture ph-mask mt-8"><h2 className="text-2xl">Group {group.number}: refine both ideas</h2>
        <h3 className="text-xl mt-5">Visible peer feedback</h3>{lesson.feedback.filter(r => r.presentingGroup === lesson.group).map(r => <article key={r.id} className="border rounded-lg p-4 mt-3"><p>Visiting Group {r.visitingGroup.slice(1)} • Idea {r.idea}</p><dl>{Object.entries(labels).map(([key, label]) => <div key={key} className="mt-2"><dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap">{r[key]}</dd></div>)}</dl></article>)}
        {!lesson.showFeedback && <p>The teacher has not opened peer feedback yet.</p>}
        {latest && <details className="mt-5"><summary>Compare latest group revision ({latest.version})</summary>{latest.ideas.map(idea => <div key={idea.idea}><h4>Idea {idea.idea}</h4>{Object.keys(revisionLabels).map(k => <p key={k}><strong>{revisionLabels[k]}</strong> {idea[k]}</p>)}</div>)}</details>}
        {latestVersion > (latest?.version || 0) && <p className="mt-4">The teacher has hidden the latest revision content. Your own draft is kept.</p>}
        {changed && !draft.pending && !draft.receipt && <div className="border p-4 mt-4"><p>The group revision changed or the teacher updated its visibility or text. Your draft is kept. Compare the available revision above before continuing.</p><button className="formWhiteButton mt-3" onClick={() => save({ ...draft, expectedVersion: latestVersion, expectedEntryVersion: latestEntryVersion, id: crypto.randomUUID(), payload: null })}>Keep my draft and use current revision version</button></div>}
        <form onSubmit={submit} className="mt-5"><fieldset disabled={busy || draft.pending || Boolean(draft.receipt)}>{group.ideas.map((idea, i) => <section key={idea.title} className="border rounded-xl p-5 mt-5"><h3 className="text-xl">Idea {i + 1}: {idea.title}</h3>{Object.entries(revisionLabels).map(([key, label]) => <label key={key} className="block mt-4">{label}<textarea aria-label={label} required rows={3} maxLength={600} value={draft.ideas[i][key]} className="formInput block w-full" onChange={e => save({ ...draft, ideas: draft.ideas.map((r, n) => n === i ? { ...r, [key]: e.target.value } : r) })} /></label>)}</section>)}</fieldset>
            {!draft.receipt && <button type="submit" className="formBlackButton mt-5" disabled={busy || (!allowed && !draft.pending) || (!draft.pending && changed)}>{busy ? 'Submitting…' : draft.pending ? 'Retry submit' : 'Submit revised ideas'}</button>}
            {draft.receipt && <><p className="mt-4">Submitted revision {draft.receipt.version} • Receipt {draft.receipt.receipt}</p><button type="button" className="formWhiteButton mt-3" onClick={() => save({ ...draft, id: crypto.randomUUID(), expectedVersion: latestVersion, expectedEntryVersion: latestEntryVersion, receipt: null, payload: null, pending: false })}>Prepare another revision</button></>}
        </form><p role="status" aria-live="polite" className="mt-4">{message || warning || 'Draft stays on this browser until the server confirms Submit.'}</p>
    </section>
}
export default function Classroom() {
    const [lesson, setLesson] = useState(null), [message, setMessage] = useState('Loading class access…'), [viewPhase, setViewPhase] = useState(null), [seat, setSeat] = useState('group1student1'), [password, setPassword] = useState(''), [busy, setBusy] = useState(false)
    const refreshSequence = useRef(0), mounted = useRef(true)
    async function refresh() {
        const sequence = ++refreshSequence.current
        try { const next = await classroomRequest('/api/workshop/classroom'); if (!mounted.current || sequence !== refreshSequence.current) return; setLesson(next); setViewPhase(value => value || next.phase); setMessage('') }
        catch (error) { if (!mounted.current || sequence !== refreshSequence.current) return; if (error.status === 401 || error.status === 403) setLesson(null); setMessage(error.message) }
    }
    useEffect(() => { const sequenceRef = refreshSequence; mounted.current = true; refresh(); const timer = setInterval(refresh, 5000); return () => { mounted.current = false; sequenceRef.current++; clearInterval(timer) } }, [])
    async function login(event) { event.preventDefault(); setBusy(true); try { await classroomRequest('/api/workshop/session', 'POST', { seat, password }); setPassword(''); setViewPhase(null); await refresh() } catch (error) { setMessage(error.message) } finally { setBusy(false) } }
    if (!lesson) return <main className="max-w-xl mx-auto p-6 py-12 ph-no-capture ph-mask"><h1 className="text-3xl">Workshop class login</h1><p className="mt-3">Use the temporary student login your teacher gave you. Your Tinkercad account is separate.</p><form onSubmit={login} className="mt-5"><label>Student label<select className="formInput block w-full" value={seat} onChange={e => setSeat(e.target.value)}>{Array.from({ length: 40 }, (_, i) => 'group' + (Math.floor(i / 4) + 1) + 'student' + (i % 4 + 1)).map(s => <option key={s}>{s}</option>)}</select></label><label className="block mt-4">Temporary password<input type="password" autoComplete="current-password" required className="formInput block w-full" value={password} onChange={e => setPassword(e.target.value)} /></label><button className="formBlackButton mt-5" disabled={busy}>{busy ? 'Signing in…' : 'Enter class'}</button></form><p role="status" className="mt-4">{message}</p></main>
    if (lesson.role === 'teacher') return <main className="p-8"><h1>Teacher account</h1><a className="underline" href="/admin/workshop">Open lesson controls and live submissions</a></main>
    return <main className="max-w-6xl mx-auto px-5 py-10 ph-no-capture ph-mask"><h1 className="text-3xl">Gallery walk: present, give feedback, refine</h1><p className="mt-3">{lesson.seat} • Group {lesson.group.slice(1)}</p>
        <div role="status" aria-live="polite" className="border rounded-xl p-4 mt-5"><p>Teacher’s active stage: <strong>{lesson.phase}</strong>. {message}</p>{viewPhase !== lesson.phase && <><p>Your draft is kept. The teacher changed stages.</p><button className="formWhiteButton mt-3" onClick={() => setViewPhase(lesson.phase)}>Open active stage</button></>}</div>
        <div className="flex flex-wrap gap-3 mt-4">{['PRESENT', 'FEEDBACK', 'REFINE'].map(phase => <button key={phase} className="formWhiteButton" onClick={() => setViewPhase(phase)} aria-pressed={phase === viewPhase}>{phase}</button>)}<button className="formWhiteButton" onClick={async () => { try { await classroomRequest('/api/workshop/session', 'DELETE'); setLesson(null); setViewPhase(null); setMessage('Signed out of the class.') } catch (error) { setMessage(error.message) } }}>Leave class</button></div>
        {lesson.ownClassDetails && <details className="mt-5 ph-no-capture ph-mask"><summary>Your private Tinkercad account details</summary><p>{lesson.ownClassDetails.accountLabel}</p><p className="whitespace-pre-wrap">{lesson.ownClassDetails.loginDetails}</p>{lesson.ownClassDetails.classLink?.startsWith('https://www.tinkercad.com/') && <a className="underline" href={lesson.ownClassDetails.classLink} target="_blank" rel="noreferrer">Open your assigned Tinkercad class</a>}</details>}
        {viewPhase === 'PRESENT' && <><p className="mt-6">Present both ideas, the difficulty each helps with, the mechanism and a useful improvement. Visitors listen and ask questions.</p>{workshopGroups.map(g => <ReviewedGroupPage key={g.id} group={workshopGroupPage(g.id)} classroom />)}</>}
        {viewPhase === 'FEEDBACK' && <><h2 className="text-2xl mt-6">Visit every project</h2><p>Read both ideas, listen to the presenters, then submit three pieces of feedback for one idea. Your own group does not review itself.</p>{workshopGroups.map(g => <section key={g.id} className="mt-10"><ReviewedGroupPage group={workshopGroupPage(g.id)} classroom /><FeedbackForm group={g} lesson={lesson} onRefresh={refresh} /></section>)}</>}
        {viewPhase === 'REFINE' && <><ReviewedGroupPage group={workshopGroupPage(lesson.group)} classroom /><RefinementForm lesson={lesson} onRefresh={refresh} /></>}
    </main>
}
