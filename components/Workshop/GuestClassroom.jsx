'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { workshopGroups, workshopClassroomGroupPage } from '@/lib/workshopPages'
import { classroomRequest as apiRequest } from './Classroom'
import { useClassPolling } from './useClassPolling'
import { clearDraftCache } from './useGuestVersionedDraft'
import ReviewedGroupPage from './ReviewedGroupPage'
import GuestFeedbackForm from './GuestFeedbackForm'
import GuestRefinementForm from './GuestRefinementForm'
import IncomingFeedback from './GuestIncomingFeedback'
export const classroomRequest = apiRequest
export default function GuestClassroom({ homeGroup = null }) {
    const router = useRouter(), [name, setName] = useState(''), [group, setGroup] = useState(homeGroup || 'g1'), [lesson, setLesson] = useState(null), [entryOpen, setEntryOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('Checking workshop entry…'), [viewPhase, setViewPhase] = useState(null), [target, setTarget] = useState(null), [actualHome, setActualHome] = useState(null)
    const lock = useRef(false), current = useRef({ version: null, seat: null }), sequence = useRef(0), mounted = useRef(true)
    const refresh = useCallback(async () => {
        const id = ++sequence.current
        try {
            const query = new URLSearchParams(); if (homeGroup) query.set('homeGroup', homeGroup); if (current.current.version !== null) { query.set('since', current.current.version); query.set('seat', current.current.seat) }
            const next = await classroomRequest('/api/workshop/guest/classroom?' + query)
            if (!mounted.current || id !== sequence.current || next.unchanged) return
            current.current = { version: next.version, seat: next.seat }; setLesson(next); setViewPhase(value => value || next.phase); setActualHome(null); setMessage('')
        } catch (error) {
            if (!mounted.current || id !== sequence.current) return
            setMessage(error.message); setActualHome(error.homeGroup || null)
            if ([401, 403].includes(error.status)) { setLesson(null); try { const status = await classroomRequest('/api/workshop/guest/session'); if (mounted.current && id === sequence.current) { setEntryOpen(status.entryOpen); if (!status.seat) setMessage(status.entryOpen ? '' : 'Your teacher has not opened entry yet.') } } catch (failure) { if (mounted.current && id === sequence.current) setMessage(failure.message) } }
        }
    }, [homeGroup])
    useClassPolling(refresh, 'guest-classroom:' + (homeGroup || 'entry'))
    useEffect(() => { const sequenceRef = sequence; mounted.current = true; return () => { mounted.current = false; sequenceRef.current++ } }, [])
    useEffect(() => { const changed = event => { if (event.key === 'fit:guest:authSignal') { current.current = { version: null, seat: null }; sequence.current++; clearDraftCache(); setLesson(null); setViewPhase(null); refresh() } }; window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed) }, [refresh])
    useEffect(() => { setTarget(null); if (lesson?.seat) { try { const value = localStorage.getItem('fit:guest:reviewTarget:' + lesson.seat); if (workshopGroups.some(row => row.id === value && row.id !== lesson.group)) setTarget(value) } catch {} } }, [lesson?.seat, lesson?.group])
    async function enter(event) {
        event.preventDefault(); if (lock.current) return; lock.current = true; sequence.current++; setBusy(true); setMessage('Entering workshop…')
        try { const identity = await classroomRequest('/api/workshop/guest/session', 'POST', { name, group }); const next = await classroomRequest('/api/workshop/guest/classroom?homeGroup=' + identity.group); current.current = { version: next.version, seat: next.seat }; setLesson(next); setViewPhase(next.phase); setMessage(''); try { localStorage.setItem('fit:guest:authSignal', crypto.randomUUID()) } catch {} router.replace('/workshop/' + identity.group + '/classroom') } catch (error) { setMessage(error.message) } finally { lock.current = false; setBusy(false) }
    }
    async function leave() { if (lock.current) return; lock.current = true; setBusy(true); try { await classroomRequest('/api/workshop/guest/session', 'DELETE'); current.current = { version: null, seat: null }; sequence.current++; clearDraftCache(); setLesson(null); setViewPhase(null); setName(''); setMessage('You left this session. Your submitted work stays recorded.'); try { localStorage.setItem('fit:guest:authSignal', crypto.randomUUID()) } catch {} router.replace('/workshop/entry'); await refresh() } catch (error) { setMessage(error.message) } finally { lock.current = false; setBusy(false) } }
    if (!lesson) return <main className="max-w-xl mx-auto p-6 py-12 ph-no-capture ph-mask"><h1 className="text-3xl">Enter the workshop</h1><p className="mt-3">Choose your group and type the name you want your teacher to see. Each browser keeps its own work. Your name is self-reported.</p><form onSubmit={enter} className="mt-5"><label className="block">Your name<input className="formInput block w-full" autoComplete="off" required maxLength={60} value={name} onChange={event => setName(event.target.value)} /></label><label className="block mt-4">Your group<select className="formInput block w-full" value={group} onChange={event => setGroup(event.target.value)}>{workshopGroups.map(row => <option key={row.id} value={row.id}>Group {row.number}</option>)}</select></label><button type="submit" className="formBlackButton mt-5" disabled={busy || !entryOpen}>{busy ? 'Entering…' : 'Enter workshop'}</button></form><p role="status" aria-live="polite" className="mt-4">{message}</p>{actualHome && <Link className="formWhiteButton mt-3" href={'/workshop/' + actualHome + '/classroom'}>Continue my Group {actualHome.slice(1)} session</Link>}</main>
    const own = workshopClassroomGroupPage(lesson.group), peer = workshopClassroomGroupPage(target || lesson.assignment.target)
    return <main className="max-w-6xl mx-auto px-5 py-10 ph-no-capture ph-mask"><h1 className="text-3xl">Group {lesson.group.slice(1)} workshop</h1><p className="mt-3">{lesson.studentName} (self-reported) | Your session {lesson.seat.slice(-6)}</p><p role="status" aria-live="polite" className="border rounded-xl p-4 mt-5">Teacher’s suggested activity: <strong>{lesson.phase}</strong>. {message}</p><div className="flex flex-wrap gap-3 mt-4">{['PRESENT', 'FEEDBACK', 'REFINE'].map(phase => <button type="button" key={phase} className="formWhiteButton" aria-pressed={phase === viewPhase} onClick={() => setViewPhase(phase)}>{phase}</button>)}<button type="button" className="formWhiteButton" disabled={busy} onClick={leave}>Leave this session</button></div>{viewPhase !== lesson.phase && <button type="button" className="formWhiteButton mt-3" onClick={() => setViewPhase(lesson.phase)}>Open active stage</button>}
        {viewPhase === 'PRESENT' && <ReviewedGroupPage group={own} classroom />}
        {viewPhase === 'FEEDBACK' && <><section><h2 className="text-2xl mt-8">Give feedback to another group</h2><p className="mt-3">Assigned review: Group {lesson.assignment.target.slice(1)}. You can also review another group.</p><label className="block mt-3">Project to review<select className="formInput block w-full" value={target || lesson.assignment.target} onChange={event => { setTarget(event.target.value); try { localStorage.setItem('fit:guest:reviewTarget:' + lesson.seat, event.target.value) } catch {} }}>{workshopGroups.filter(row => row.id !== lesson.group).map(row => <option key={row.id} value={row.id}>Group {row.number}</option>)}</select></label><ReviewedGroupPage group={peer} classroom /><GuestFeedbackForm key={lesson.seat + ':' + peer.id} group={peer} lesson={lesson} onRefresh={refresh} /></section></>}
        {viewPhase === 'REFINE' && <><ReviewedGroupPage group={own} classroom /><GuestRefinementForm key={lesson.seat} lesson={lesson} onRefresh={refresh} /></>}
        <IncomingFeedback lesson={lesson} />
    </main>
}
