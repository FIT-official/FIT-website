'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { workshopGroups, workshopClassroomGroupPage } from '@/lib/workshopPages'
import { classroomRequest as apiRequest } from './Classroom'
import { useClassPolling } from './useClassPolling'
import { clearDraftCache } from './useGuestVersionedDraft'
import ReviewedGroupPage from './ReviewedGroupPage'
import GuestBalancedFeedback from './GuestBalancedFeedback'
import GuestRefineWorkspace from './GuestRefineWorkspace'
import IncomingFeedback from './GuestIncomingFeedback'
import GuestTinkercad from './GuestTinkercad'
import GuestReturnHelp from './GuestReturnHelp'
import styles from './GuestClassroom.module.css'
import design from './ClassroomDesign.module.css'
import { ClassBrand, ClassIcon, IdeaPal } from './ClassroomDecor'
export const classroomRequest = apiRequest
export default function GuestClassroom({ homeGroup = null }) {
    const router = useRouter(), [name, setName] = useState(''), [group, setGroup] = useState(homeGroup || 'g1'), [lesson, setLesson] = useState(null), [entryOpen, setEntryOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('Checking class entry…'), [viewPhase, setViewPhase] = useState(null), [target, setTarget] = useState(null), [targetRound, setTargetRound] = useState(null), [exploreGroup, setExploreGroup] = useState(null), [offline, setOffline] = useState(false), [actualHome, setActualHome] = useState(null)
    const [pendingJoin, setPendingJoin] = useState(null)
    const [entryMode, setEntryMode] = useState('name'), [classId, setClassId] = useState(''), [studentId, setStudentId] = useState(''), [showStudentId, setShowStudentId] = useState(false)
    const lock = useRef(false), authenticating = useRef(false), current = useRef({ version: null, seat: null }), sequence = useRef(0), mounted = useRef(true)
    const refresh = useCallback(async () => {
        if (authenticating.current) return true
        const id = ++sequence.current
        try {
            const query = new URLSearchParams(); if (homeGroup) query.set('homeGroup', homeGroup); if (current.current.version !== null) { query.set('since', current.current.version); query.set('seat', current.current.seat) }
            const next = await classroomRequest('/api/workshop/guest/classroom?' + query)
            if (!mounted.current || id !== sequence.current || next.unchanged) return
            if (current.current.seat === next.seat && current.current.version !== null && next.version < current.current.version) return
            current.current = { version: next.version, seat: next.seat }; setLesson(next); setPendingJoin(null); setViewPhase(value => value || next.phase); setActualHome(null); setMessage('')
        } catch (error) {
            if (!mounted.current || id !== sequence.current) return
            setMessage(error.message); setActualHome(error.homeGroup || null)
            if ([401, 403].includes(error.status)) { setLesson(null); try { const status = await classroomRequest('/api/workshop/guest/session'); if (mounted.current && id === sequence.current) { setEntryOpen(status.entryOpen); setPendingJoin(status.pending ? status : null); if (!status.seat) setMessage(status.pending ? status.message : status.entryOpen ? '' : 'Your teacher has not opened entry yet.') } } catch (failure) { if (mounted.current && id === sequence.current) setMessage(failure.message); return false } return true }
            return false
        }
    }, [homeGroup])
    useClassPolling(refresh, 'guest-classroom:' + (homeGroup || 'entry'))
    useEffect(() => { const changed = () => setOffline(navigator.onLine === false); changed(); window.addEventListener('online', changed); window.addEventListener('offline', changed); return () => { window.removeEventListener('online', changed); window.removeEventListener('offline', changed) } }, [])
    useEffect(() => { const sequenceRef = sequence; mounted.current = true; return () => { mounted.current = false; sequenceRef.current++ } }, [])
    useEffect(() => { const changed = event => { if (event.key === 'fit:guest:authSignal') { current.current = { version: null, seat: null }; sequence.current++; clearDraftCache(); setLesson(null); setViewPhase(null); refresh() } }; window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed) }, [refresh])
    useEffect(() => { setTarget(null); setTargetRound(lesson?.assignment?.round); if (lesson?.seat) { try { const value = localStorage.getItem('fit:guest:reviewTarget:' + lesson.seat + ':' + lesson.assignment.round); if (workshopGroups.some(row => row.id === value && row.id !== lesson.group)) setTarget(value) } catch {} } }, [lesson?.seat, lesson?.group, lesson?.assignment?.round])
    useEffect(() => { if (lesson?.navigationLocked) setViewPhase(lesson.navigationTarget) }, [lesson?.navigationLocked, lesson?.navigationTarget, lesson?.navigationVersion])
    async function openClass(identity, id) {
        current.current = { version: null, seat: null }; clearDraftCache(); setLesson(null); setPendingJoin(null); setViewPhase(null); setTarget(null); setTargetRound(null); setExploreGroup(null); setActualHome(null); setStudentId(''); setShowStudentId(false)
        try { localStorage.setItem('fit:guest:authSignal', crypto.randomUUID()) } catch {}
        const next = await classroomRequest('/api/workshop/guest/classroom?homeGroup=' + identity.group)
        if (!mounted.current || id !== sequence.current) return
        current.current = { version: next.version, seat: next.seat }; setLesson(next); setViewPhase(next.phase); setMessage(''); router.replace('/workshop/' + identity.group + '/classroom')
    }
    async function enter(event) {
        event.preventDefault(); if (lock.current) return; lock.current = true; authenticating.current = true; const id = ++sequence.current; setBusy(true); setMessage('Entering class.')
        try {
            await classroomRequest('/api/workshop/guest/session', 'POST', { prepare: true })
            if (!mounted.current || id !== sequence.current) return
            const identity = await classroomRequest('/api/workshop/guest/session', 'POST', { name, group })
            if (!mounted.current || id !== sequence.current) return
            if (identity.pending) { setPendingJoin(identity); setMessage(identity.message); return }
            await openClass(identity, id)
        } catch (error) { if (mounted.current && id === sequence.current) setMessage(error.message) } finally { lock.current = false; authenticating.current = false; if (mounted.current) setBusy(false) }
    }
    async function signIn(event) {
        event.preventDefault(); if (lock.current) return; lock.current = true; authenticating.current = true; const id = ++sequence.current; setBusy(true); setMessage('Signing in.')
        try {
            const identity = await classroomRequest('/api/workshop/guest/student-login', 'POST', { studentId: studentId.trim(), classId: classId.trim() })
            if (!mounted.current || id !== sequence.current) return
            await openClass(identity, id)
        } catch (error) { if (mounted.current && id === sequence.current) setMessage(error.message) } finally { lock.current = false; authenticating.current = false; if (mounted.current) setBusy(false) }
    }
    async function leave() { if (lock.current) return; lock.current = true; setBusy(true); try { await classroomRequest('/api/workshop/guest/session', 'DELETE'); current.current = { version: null, seat: null }; sequence.current++; clearDraftCache(); setLesson(null); setPendingJoin(null); setViewPhase(null); setName(''); setStudentId(''); setShowStudentId(false); setMessage('You left this session. Your submitted work stays recorded.'); try { localStorage.setItem('fit:guest:authSignal', crypto.randomUUID()) } catch {} router.replace('/workshop/entry'); await refresh() } catch (error) { setMessage(error.message) } finally { lock.current = false; setBusy(false) } }
    if (!lesson) return <main className={design.shell + ' ph-no-capture ph-mask'}>
        <ClassBrand />
        <div className={design.intro}>
            <div className={design.introCopy}><p className={design.eyebrow}>Small ideas. Big possibilities.</p><h1>Enter the class</h1><p className="mt-4">Sign in with your Student ID to return to your work, or join with your name and group.</p><IdeaPal /></div>
            <section className={design.entryCard} aria-label="Class entry"><h2>Ready to make something?</h2><p className="mt-2">Your group, your ideas, your next step.</p>
                <div className="flex flex-wrap gap-2 mt-5" aria-label="Choose how to enter"><button type="button" className="formWhiteButton" style={{ minHeight: 44 }} disabled={busy} aria-pressed={entryMode === 'student'} onClick={() => { setEntryMode('student'); setMessage('') }}>Sign in with Student ID</button><button type="button" className="formWhiteButton" style={{ minHeight: 44 }} disabled={busy} aria-pressed={entryMode === 'name'} onClick={() => { setEntryMode('name'); setMessage(''); setStudentId(''); setShowStudentId(false) }}>Join with name and group</button></div>
                {entryMode === 'student' ? <form onSubmit={signIn} className="mt-5" aria-label="Student ID sign in"><p className="text-sm" id="student-id-help">Use the Class ID and private Student login previously provided for Tinkercad. That Student login is your Student ID here too, including on another browser or device.</p><label className="block mt-4" htmlFor="return-class-id">Class ID</label><input id="return-class-id" style={{ minHeight: 44 }} className="formInput block w-full" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={128} value={classId} onChange={event => setClassId(event.target.value)} /><label className="block mt-4" htmlFor="return-student-id">Student ID</label><input id="return-student-id" style={{ minHeight: 44 }} className="formInput block w-full ph-mask ph-no-capture" type={showStudentId ? 'text' : 'password'} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="student-id-help" required maxLength={256} value={studentId} onChange={event => setStudentId(event.target.value)} /><label className="flex items-center gap-2 mt-3"><input type="checkbox" checked={showStudentId} onChange={event => setShowStudentId(event.target.checked)} />Show Student ID</label><button type="submit" style={{ minHeight: 44 }} className="formBlackButton mt-5" disabled={busy || !classId.trim() || !studentId.trim()}>{busy ? 'Signing in…' : 'Sign in'}<ClassIcon kind="ARROW" /></button></form> : pendingJoin ? <section className="border rounded-xl p-4 mt-5" aria-label="Waiting for teacher confirmation"><h3 className="font-bold">Your earlier work is safe</h3><p className="mt-2">Group {pendingJoin.group.slice(1)} · {pendingJoin.name}</p><p className="mt-2">Your teacher will check which class identity is yours. Keep this browser open, or sign in with your Student ID above. No previous identity is opened by name alone.</p><button type="button" className="formWhiteButton mt-4" style={{ minHeight: 44 }} disabled={busy} onClick={refresh}>Check teacher confirmation</button><button type="button" className="formWhiteButton mt-4" style={{ minHeight: 44 }} disabled={busy} onClick={leave}>Cancel waiting request</button></section> : <form onSubmit={enter} className="mt-5"><label className="block">Your name<input style={{ minHeight: 44 }} className="formInput block w-full" autoComplete="off" required maxLength={60} value={name} onChange={event => setName(event.target.value)} /></label><p className="text-sm mt-2">Capital letters and extra spaces do not matter. Use the name you used last week; your teacher can help with a shorter or longer version.</p><label className="block mt-4">Your group<select style={{ minHeight: 44 }} className="formInput block w-full" value={group} onChange={event => setGroup(event.target.value)}>{workshopGroups.map(row => <option key={row.id} value={row.id}>Group {row.number}</option>)}</select></label><button type="submit" style={{ minHeight: 44 }} className="formBlackButton mt-5" disabled={busy || !entryOpen}>{busy ? 'Entering…' : 'Enter class'}<ClassIcon kind="ARROW" /></button></form>}
                <p role="status" aria-live="polite" className={message ? design.status : ''}>{message}</p>{actualHome && <div className="flex flex-wrap gap-2 mt-3"><Link className="formWhiteButton" href={'/workshop/' + actualHome + '/classroom'}>Continue my Group {actualHome.slice(1)} session</Link><button type="button" className="formWhiteButton" disabled={busy} onClick={leave}>Leave current class session</button></div>}
                {message && !busy && <button type="button" className="formWhiteButton mt-3" style={{ minHeight: 44 }} onClick={refresh}>Check again</button>}
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
        {activeView === 'FEEDBACK' && <section className="mt-8"><div className={design.sectionHeading}><ClassIcon kind="FEEDBACK" /><div><h2>Feedback for Group {peer.number}</h2><p>Round {lesson.assignment.round}: first send feedback on both ideas to Group {lesson.assignment.target.slice(1)}. Then you can review other groups.</p></div></div>
            <p className="font-semibold mt-3">{lesson.reviewCompletion?.complete ? 'Both required ideas reviewed. You can review more groups.' : 'Still to do: review both ideas for Group ' + lesson.assignment.target.slice(1)}</p>{!lesson.reviewCompletion?.complete && targetGroup !== lesson.assignment.target && <button type="button" className="formWhiteButton mt-2" onClick={() => { setTarget(lesson.assignment.target); setTargetRound(lesson.assignment.round) }}>Go to Group {lesson.assignment.target.slice(1)}</button>}
            <label className="block mt-4 font-semibold">Group to review<select className="formInput block w-full max-w-sm" aria-label="Group to review" value={targetGroup} onChange={event => { setTarget(event.target.value); setTargetRound(lesson.assignment.round); try { localStorage.setItem('fit:guest:reviewTarget:' + lesson.seat + ':' + lesson.assignment.round, event.target.value) } catch {} }}>{workshopGroups.filter(row => row.id !== lesson.group).map(row => <option key={row.id} value={row.id}>Group {row.number}{row.id === lesson.assignment.target ? ' (your next group)' : ''}</option>)}</select></label>
            <GuestBalancedFeedback key={lesson.seat + ':' + peer.id + ':' + lesson.assignment.round} group={peer} lesson={lesson} onRefresh={refresh} />
        </section>}
        {activeView === 'REFINE' && <GuestRefineWorkspace key={lesson.seat} group={own} lesson={lesson} onRefresh={refresh} />}
        <IncomingFeedback lesson={lesson} />
    </main>
}
