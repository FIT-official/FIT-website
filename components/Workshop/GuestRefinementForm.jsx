'use client'
import { useRef, useState } from 'react'
import { WORKSHOP_SESSION } from '@/lib/workshopFeedback'
import { workshopGroupPage } from '@/lib/workshopPages'
import { classroomRequest } from './GuestClassroom'
import { useVersionedDraft } from './useGuestVersionedDraft'
import DraftHistory from './DraftHistory'
import design from './ClassroomDesign.module.css'
import { ClassIcon } from './ClassroomDecor'

const labels = { change: 'What would you change to improve this idea?', reason: 'Why would this improve the idea?', test: 'How would you test this change?' }
const historicalLabels = { feedbackUsed: 'Which feedback are you using?', change: 'What will you change?', reason: 'Why will this improve the idea?', test: 'How will you test the change?' }
const emptyIdea = () => ({ feedbackUsed: '', change: '', reason: '', test: '' })
function useIdea(lesson, number) { const topic = 'refinement-' + lesson.group + '-idea' + number; return useVersionedDraft('fit:guest:' + WORKSHOP_SESSION + ':' + lesson.seat + ':' + topic, lesson.seat, topic, emptyIdea, true, lesson.group) }
export default function GuestRefinementForm({ lesson, onRefresh }) {
    const group = workshopGroupPage(lesson.group), latest = lesson.refinements.filter(row => row.seat === lesson.seat).at(-1), latestVersion = lesson.refinementVersion ?? latest?.authorVersion ?? latest?.version ?? 0, latestEntry = lesson.refinementEntryVersion ?? (latest ? latest.entryVersion || 1 : 0)
    const first = useIdea(lesson, 1), second = useIdea(lesson, 2), ideas = [first, second]
    const [draft, save] = useVersionedDraft('fit:guest:' + WORKSHOP_SESSION + ':' + lesson.seat + ':refinement', lesson.seat, 'refinement', () => ({ id: crypto.randomUUID(), expectedVersion: latestVersion, expectedEntryVersion: latestEntry, ideas: [emptyIdea(), emptyIdea()], pending: false, payload: null, receipt: null }), false, lesson.group)
    const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), lock = useRef(false)
    if (!draft || ideas.some(([value]) => !value)) return <p>Loading your two idea drafts.</p>
    const changed = draft.expectedVersion !== latestVersion || (draft.expectedEntryVersion ?? (draft.expectedVersion ? 1 : 0)) !== latestEntry, allowed = lesson.refinementOpen, conflicted = ideas.some(([, , , controls]) => controls.conflict)
    async function submit(event) {
        event.preventDefault(); if (lock.current || !draft.pending && (!allowed || changed || conflicted)) return
        const payload = draft.payload || { kind: 'refinement', promptVersion: 2, expectedSeat: lesson.seat, submissionId: draft.id, phaseVersion: lesson.phaseVersion, expectedVersion: draft.expectedVersion, expectedEntryVersion: draft.expectedEntryVersion ?? (draft.expectedVersion ? 1 : 0), ideas: ideas.map(([value]) => Object.fromEntries(Object.keys(labels).map(field => [field, value[field]]))) }
        lock.current = true; setBusy(true); save({ ...draft, ideas: ideas.map(([value]) => value), pending: true, payload }); setMessage('Submitting.')
        try { const receipt = await classroomRequest('/api/workshop/guest/classroom?homeGroup=' + lesson.group, 'POST', { ...payload, expectedSeat: lesson.seat }); if (!receipt.confirmed || receipt.receipt !== draft.id) throw Error('The server has not confirmed this submission. Your draft is kept; retry.'); save({ ...draft, ideas: ideas.map(([value]) => value), pending: false, payload, receipt }); setMessage(''); onRefresh() }
        catch (error) { setMessage(error.status === 409 ? 'The class changed. Your answers are kept. Try again.' : 'Couldn’t submit. Your answers are kept. Try again.'); if (error.status && error.status < 500 && error.status !== 429) save({ ...draft, id: crypto.randomUUID(), pending: false, payload: null }); onRefresh() }
        finally { lock.current = false; setBusy(false) }
    }
    return <section className="ph-mask ph-no-capture mt-8"><h2 className="text-2xl">Group {group.number}: refine both ideas</h2>
        <h3 className="text-xl mt-6">Group contributions ({lesson.refinements.length})</h3><p>Read the changes your group has suggested.</p>
        {lesson.refinements.map((row, index) => <details key={row.id} className="border rounded-lg p-3 mt-3"><summary>Group {group.number} suggestion {index + 1}</summary>{row.ideas.map(idea => <section key={idea.idea} className="mt-3"><h4>Idea {idea.idea}</h4>{Object.keys(row.promptVersion === 2 ? labels : historicalLabels).map(field => <p key={field} className="whitespace-pre-wrap"><strong>{(row.promptVersion === 2 ? labels : historicalLabels)[field]}</strong> {idea[field]}</p>)}</section>)}</details>)}
        {changed && !draft.pending && !draft.receipt && <div className="border p-4 mt-4"><p>Your saved answer changed. Read it above before submitting again.</p><button type="button" className="formWhiteButton mt-3" onClick={() => save({ ...draft, expectedVersion: latestVersion, expectedEntryVersion: latestEntry, id: crypto.randomUUID(), payload: null })}>Keep my answers and continue</button></div>}
        <form className="mt-5" onSubmit={submit}>{group.ideas.map((idea, index) => { const [value, saveIdea, status, controls] = ideas[index]; return <section key={idea.title} className={design.panel + ' ' + design.writing + ' mt-5'}><h3 className="text-xl">Idea {index + 1}: {idea.title}</h3><fieldset disabled={busy || draft.pending || Boolean(draft.receipt)}>{Object.entries(labels).map(([field, label]) => <label key={field} className="block mt-4">{label}<textarea aria-label={'Idea ' + (index + 1) + ': ' + label} required rows={3} maxLength={600} value={value[field]} className="formInput block w-full" onChange={event => saveIdea({ ...value, [field]: event.target.value })} /></label>)}</fieldset><DraftHistory controls={controls} disabled={busy || draft.pending || Boolean(draft.receipt)} status={status} /></section> })}
            {!draft.receipt && <button type="submit" className="formBlackButton mt-5" disabled={busy || !draft.pending && (!allowed || changed || conflicted)}>{busy ? 'Submitting.' : draft.pending ? 'Try Submit again' : 'Submit revised ideas'}<ClassIcon kind="ARROW" /></button>}
            {draft.receipt && <><p role="status" className={design.receipt}><ClassIcon kind="CHECK" />Submitted</p><button type="button" className="formWhiteButton mt-3" onClick={() => save({ ...draft, id: crypto.randomUUID(), expectedVersion: latestVersion, expectedEntryVersion: latestEntry, receipt: null, payload: null, pending: false })}>Prepare another revision</button></>}
        </form><p role="status" aria-live="polite" className="mt-4">{message}</p>
    </section>
}
