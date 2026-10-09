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
import GuestRefineWorkspace from './GuestRefineWorkspace'
import IncomingFeedback from './GuestIncomingFeedback'
import GuestIdeaReading from './GuestIdeaReading'
import GuestTinkercad from './GuestTinkercad'
import GuestReturnHelp from './GuestReturnHelp'
import styles from './GuestClassroom.module.css'
import design from './ClassroomDesign.module.css'
import { ClassBrand, ClassIcon, IdeaPal } from './ClassroomDecor'
export const classroomRequest = apiRequest
export default function GuestClassroom({ homeGroup = null }) {
    const router = useRouter(), [name, setName] = useState(''), [group, setGroup] = useState(homeGroup || 'g1'), [lesson, setLesson] = useState(null), [entryOpen, setEntryOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('Checking class entry…'), [viewPhase, setViewPhase] = useState(null), [target, setTarget] = useState(null), [targetRound, setTargetRound] = useState(null), [selectedIdea, setSelectedIdea] = useState('1'), [exploreGroup, setExploreGroup] = useState(null), [offline, setOffline] = useState(false), [actualHome, setActualHome] = useState(null)
    const lock = useRef(false), current = useRef({ version: null, seat: null }), sequence = useRef(0), mounted = useRef(true)
    const refresh = useCallback(async () => {
        const id = ++sequence.current
        try {
            const query = new URLSearchParams(); if (homeGroup) query.set('homeGroup', homeGroup); if (current.current.version !== null) { query.set('since', current.current.version); query.set('seat', current.current.seat) }
            const next = await classroomRequest('/api/workshop/guest/classroom?' + query)
            if (!mounted.current || id !== sequence.current || next.unchanged) return
            if (current.current.seat === next.seat && current.current.version !== null && next.version < current.current.version) return
            current.current = { version: next.version, seat: next.seat }; setLesson(next); setViewPhase(value => value || next.phase); setActualHome(null); setMessage('')
        } catch (error) {
            if (!mounted.current || id !== sequence.current) return
            setMessage(error.message); setActualHome(error.homeGroup || null)
            if ([401, 403].includes(error.status)) { setLesson(null); try { const status = await classroomRequest('/api/workshop/guest/session'); if (mounted.current && id === sequence.current) { setEntryOpen(status.entryOpen); if (!status.seat) setMessage(status.entryOpen ? '' : 'Your teacher has not opened entry yet.') } } catch (failure) { if (mounted.current && id === sequence.current) setMessage(failure.message) } }
        }
    }, [homeGroup])
    useClassPolling(refresh, 'guest-classroom:' + (homeGroup || 'entry'))
    useEffect(() => { const changed = () => setOffline(navigator.onLine === false); changed(); window.addEventListener('online', changed); window.addEventListener('offline', changed); return () => { window.removeEventListener('online', changed); window.removeEventListener('offline', changed) } }, [])
    useEffect(() => { const sequenceRef = sequence; mounted.current = true; return () => { mounted.current = false; sequenceRef.current++ } }, [])
    useEffect(() => { const changed = event => { if (event.key === 'fit:guest:authSignal') { current.current = { version: null, seat: null }; sequence.current++; clearDraftCache(); setLesson(null); setViewPhase(null); refresh() } }; window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed) }, [refresh])
    useEffect(() => { setTarget(null); setTargetRound(lesson?.assignment?.round); setSelectedIdea('1'); if (lesson?.seat) { try { const value = localStorage.getItem('fit:guest:reviewTarget:' + lesson.seat + ':' + lesson.assignment.round); if (workshopGroups.some(row => row.id === value && row.id !== lesson.group)) setTarget(value) } catch {} } }, [lesson?.seat, lesson?.group, lesson?.assignment?.round])
    useEffect(() => { if (lesson?.navigationLocked) setViewPhase(lesson.navigationTarget) }, [lesson?.navigationLocked, lesson?.navigationTarget, lesson?.navigationVersion])
    async function enter(event) {
        event.preventDefault(); if (lock.current) return; lock.current = true; sequence.current++; setBusy(true); setMessage('Entering class…')
        try { const identity = await classroomRequest('/api/workshop/guest/session', 'POST', { name, group }); const next = await classroomRequest('/api/workshop/guest/classroom?homeGroup=' + identity.group); current.current = { version: next.version, seat: next.seat }; setLesson(next); setViewPhase(next.phase); setMessage(''); try { localStorage.setItem('fit:guest:authSignal', crypto.randomUUID()) } catch {} router.replace('/workshop/' + identity.group + '/classroom') } catch (error) { setMessage(error.message) } finally { lock.current = false; setBusy(false) }
    }
    async function leave() { if (lock.current) return; lock.current = true; setBusy(true); try { await classroomRequest('/api/workshop/guest/session', 'DELETE'); current.current = { version: null, seat: null }; sequence.current++; clearDraftCache(); setLesson(null); setViewPhase(null); setName(''); setMessage('You left this session. Your submitted work stays recorded.'); try { localStorage.setItem('fit:guest:authSignal', crypto.randomUUID()) } catch {} router.replace('/workshop/entry'); await refresh() } catch (error) { setMessage(error.message) } finally { lock.current = false; setBusy(false) } }
    if (!lesson) return <main className={design.shell + ' ph-no-capture ph-mask'}>
        <ClassBrand />
        <div className={design.intro}>
            <div className={design.introCopy}><p className={design.eyebrow}>Small ideas. Big possibilities.</p><h1>Enter the class</h1><p className="mt-4">Choose your group and enter your name.</p><IdeaPal /></div>
            <section className={design.entryCard} aria-label="Class entry"><h2>Ready to make something?</h2><p className="mt-2">Your group, your ideas, your next step.</p>
                <form onSubmit={enter} className="mt-5"><label className="block">Your name<input className="formInput block w-full" autoComplete="off" required maxLength={60} value={name} onChange={event => setName(event.target.value)} /></label><label className="block mt-4">Your group<select className="formInput block w-full" value={group} onChange={event => setGroup(event.target.value)}>{workshopGroups.map(row => <option key={row.id} value={row.id}>Group {row.number}</option>)}</select></label><button type="submit" className="formBlackButton mt-5" disabled={busy || !entryOpen}>{busy ? 'Entering…' : 'Enter class'}<ClassIcon kind="ARROW" /></button></form>
                <p role="status" aria-live="polite" className={message ? design.status : ''}>{message}</p>{actualHome && <Link className="formWhiteButton mt-3" href={'/workshop/' + actualHome + '/classroom'}>Continue my Group {actualHome.slice(1)} session</Link>}
            </section>
        </div><GuestReturnHelp />
    </main>
    const own = workshopClassroomGroupPage(lesson.group), targetGroup = targetRound === lesson.assignment.round && target || lesson.assignment.target, peer = workshopClassroomGroupPage(targetGroup)
    const activeView = lesson.navigationLocked ? lesson.navigationTarget : viewPhase, names = { PRESENT: 'Explore', FEEDBACK: 'Feedback', REFINE: 'Refine' }
    return <main className={design.shell + ' ph-no-capture ph-mask'}><ClassBrand /><header className={design.studentHeader}><div><p className={design.eyebrow}>Let&apos;s make ideas better</p><h1>Group {lesson.group.slice(1)} class</h1><p className={design.studentName}>{lesson.studentName}</p></div><button type="button" className="formWhiteButton" disabled={busy} onClick={leave}>Leave class</button></header><GuestReturnHelp />
        {offline && <p role="status" className="mt-3">You are offline. Keep writing here, then reconnect to save.</p>}
        {lesson.navigationLocked && <p role="status" className="border rounded-lg p-3 mt-4">Stay on {names[lesson.navigationTarget]} for now. Your teacher will let you know when to move on.</p>}
        {message && <p role="status" aria-live="polite" className="mt-3">{message}</p>}
        <nav className={design.activityNav} aria-label="Class activities">{['PRESENT', 'FEEDBACK', 'REFINE', 'TINKERCAD'].map(phase => <button type="button" key={phase} className={design.activityButton} disabled={lesson.navigationLocked && phase !== lesson.navigationTarget} aria-pressed={phase === activeView} onClick={() => { if (!lesson.navigationLocked) setViewPhase(phase) }}><ClassIcon kind={phase} /><span>{phase === 'TINKERCAD' ? 'Tinkercad' : names[phase]}</span></button>)}</nav>
        {activeView === 'TINKERCAD' && <GuestTinkercad key={lesson.seat} seat={lesson.seat} group={lesson.group} />}
        {activeView === 'PRESENT' && <section className="mt-6"><h2 className="text-2xl font-bold">Explore everyone’s ideas</h2><p className="mt-2">Choose a group to read its two ideas.</p><label className="block mt-3">Group to explore<select className="formInput block" aria-label="Group to explore" value={exploreGroup || lesson.group} onChange={event => setExploreGroup(event.target.value)}>{workshopGroups.map(row => <option value={row.id} key={row.id}>Group {row.number}</option>)}</select></label><ReviewedGroupPage group={workshopClassroomGroupPage(exploreGroup || lesson.group)} classroom /></section>}
        {activeView === 'FEEDBACK' && <section className="mt-8"><div className={design.sectionHeading}><ClassIcon kind="FEEDBACK" /><div><h2>Feedback for Group {peer.number}</h2><p>Round {lesson.assignment.round}: first send feedback to Group {lesson.assignment.target.slice(1)}. Then you can review other groups.</p></div></div>
            <p className="font-semibold mt-3">{lesson.reviewCompletion?.complete ? 'Required feedback submitted. You can review more groups.' : 'Still to do: feedback for Group ' + lesson.assignment.target.slice(1)}</p>{!lesson.reviewCompletion?.complete && targetGroup !== lesson.assignment.target && <button type="button" className="formWhiteButton mt-2" onClick={() => { setTarget(lesson.assignment.target); setTargetRound(lesson.assignment.round); setSelectedIdea('1') }}>Go to Group {lesson.assignment.target.slice(1)}</button>}
            <label className="block mt-4 font-semibold">Group to review<select className="formInput block w-full max-w-sm" aria-label="Group to review" value={targetGroup} onChange={event => { setTarget(event.target.value); setTargetRound(lesson.assignment.round); setSelectedIdea('1'); try { localStorage.setItem('fit:guest:reviewTarget:' + lesson.seat + ':' + lesson.assignment.round, event.target.value) } catch {} }}>{workshopGroups.filter(row => row.id !== lesson.group).map(row => <option key={row.id} value={row.id}>Group {row.number}{row.id === lesson.assignment.target ? ' (your next group)' : ''}</option>)}</select></label>
            <nav aria-label="Move between idea and feedback" className={styles.jumps}><a className="formBlackButton" href="#feedback-writing">Write feedback</a><a className="formWhiteButton" href="#feedback-idea">Back to idea</a></nav>
            <div className={styles.columns}><div id="feedback-idea" className={styles.idea + ' ' + design.panel}><GuestIdeaReading group={peer} idea={selectedIdea} /><a className="formWhiteButton mt-4" href="#feedback-writing">Write feedback</a></div><div id="feedback-writing" className={styles.form}><a className="underline text-sm" href="#feedback-idea">Back to idea</a><GuestFeedbackForm key={lesson.seat + ':' + peer.id + ':' + lesson.assignment.round} group={peer} lesson={lesson} onRefresh={refresh} selectedIdea={selectedIdea} onIdeaChange={setSelectedIdea} /></div></div>
        </section>}
        {activeView === 'REFINE' && <GuestRefineWorkspace key={lesson.seat} group={own} lesson={lesson} onRefresh={refresh} />}
        <IncomingFeedback lesson={lesson} />
    </main>
}
