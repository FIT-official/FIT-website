'use client'
import { useRef, useState } from 'react'
import { WORKSHOP_SESSION } from '@/lib/workshopFeedback'
import { classroomRequest } from './GuestClassroom'
import { useVersionedDraft } from './useGuestVersionedDraft'
import DraftHistory from './DraftHistory'
const labels = { whatWorks: 'What works well, and why?', question: 'What question would you ask the presenters?', improvement: 'What specific improvement do you suggest?' }
export default function GuestFeedbackForm({ group, lesson, onRefresh }) {
    const [idea, setIdea] = useState('1')
    const key = 'fit:guest:' + WORKSHOP_SESSION + ':' + lesson.seat + ':feedback:' + group.id + ':idea:' + idea
    const [draft, save, warning, history] = useVersionedDraft(key, lesson.seat, 'feedback-' + group.id + '-idea' + idea, () => ({ id: crypto.randomUUID(), idea, whatWorks: '', question: '', improvement: '', receipt: null, pending: false, payload: null }), group.id !== lesson.group, lesson.group)
    const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), lock = useRef(false)
    const allowed = group.id !== lesson.group && lesson.feedbackOpen
    const prompts = group.reading ? Object.fromEntries(Object.keys(labels).map((field, index) => [field, group.reading.feedbackQuestions[index]])) : labels
    async function submit(event) {
        event.preventDefault(); if (lock.current || !draft || (!allowed && !draft.pending) || history.conflict && !draft.pending) return
        const payload = draft.payload || { kind: 'feedback', expectedSeat: lesson.seat, submissionId: draft.id, session: WORKSHOP_SESSION, phaseVersion: lesson.phaseVersion, reviewRound: lesson.assignment.round, projectVersion: lesson.assignment.projectVersion, presentingGroup: group.id, visitingGroup: lesson.group, idea: draft.idea, ...Object.fromEntries(Object.keys(labels).map(field => [field, draft[field]])) }
        lock.current = true; setBusy(true); save({ ...draft, pending: true, payload }); setMessage('Submitting.')
        try { const receipt = await classroomRequest('/api/workshop/guest/classroom?homeGroup=' + lesson.group, 'POST', { ...payload, expectedSeat: lesson.seat }); if (!receipt.confirmed || receipt.receipt !== draft.id) throw Error('The server has not confirmed this submission. Your draft is kept; retry.'); save({ ...draft, pending: false, payload, receipt }); setMessage('Submitted. Receipt ' + receipt.receipt + '. Your own contribution is recorded.'); onRefresh() }
        catch (error) { setMessage(error.message); if (error.status && error.status < 500 && error.status !== 429) save({ ...draft, id: crypto.randomUUID(), pending: false, payload: null }); onRefresh() }
        finally { lock.current = false; setBusy(false) }
    }
    if (group.id === lesson.group) return <p>Your group does not review itself.</p>
    return <section className="ph-mask ph-no-capture border rounded-xl p-5 mt-5">
        <h3 className="text-xl">Group {group.number}: visitor feedback</h3><p className="text-sm mt-2">Your name: {lesson.studentName} (self-reported) | Home Group {lesson.group.slice(1)}. Classmates submit their own contributions; yours does not replace theirs.</p>
        <label className="block mt-3">Choose the idea<select value={idea} className="formInput block w-full" disabled={busy || draft?.pending} onChange={event => { setIdea(event.target.value); setMessage('') }}>{group.ideas.map((value, index) => <option key={value.title} value={String(index + 1)}>Idea {index + 1}: {value.title}</option>)}</select></label>
        {!draft ? <p>Loading this idea&apos;s draft.</p> : <form aria-label={'Feedback for Group ' + group.number} onSubmit={submit}>
            <fieldset disabled={busy || draft.pending || Boolean(draft.receipt)}>{Object.entries(labels).map(([field, label]) => <label key={field} className="block mt-4">{label}<span id={group.id + '-' + idea + '-' + field + '-hint'} className="block text-sm mt-2">{prompts[field]}</span><textarea aria-label={label} aria-describedby={group.id + '-' + idea + '-' + field + '-hint'} required maxLength={600} rows={5} value={draft[field]} onChange={event => save({ ...draft, [field]: event.target.value })} className="formInput block w-full" /></label>)}</fieldset>
            <DraftHistory controls={history} disabled={busy || draft.pending || Boolean(draft.receipt)} status={warning} />
            {!draft.receipt && <button type="submit" className="formBlackButton mt-4" disabled={busy || !draft.pending && (!allowed || history.conflict)}>{busy ? 'Submitting.' : draft.pending ? 'Retry submit' : 'Submit'}</button>}
            {draft.receipt && <><p className="mt-4">Submitted | Receipt {draft.receipt.receipt}</p><button type="button" className="formWhiteButton mt-3" onClick={() => { save({ id: crypto.randomUUID(), idea, whatWorks: '', question: '', improvement: '', receipt: null, pending: false, payload: null }); setMessage('') }}>Write new feedback</button></>}
            {!allowed && <p className="mt-3">New submission is closed for this target. Your saved draft and pending receipt remain recoverable.</p>}
            <p role="status" aria-live="polite" className="mt-3">{message}</p>
        </form>}
    </section>
}
