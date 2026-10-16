'use client'
import { useEffect, useRef, useState } from 'react'
import { classroomRequest } from './Classroom'
import { useClassPolling } from './useClassPolling'
import CopyField from './CopyField'

const messages = { 'not-ready': 'Your teacher is preparing the Tinkercad class.', 'awaiting-approval': 'Ask your teacher to approve this class session. Your login will appear here.', paused: 'New Tinkercad assignments are paused. Ask your teacher when to begin.', exhausted: 'All available Tinkercad logins are assigned. Ask your teacher for help.' }
export default function GuestTinkercad({ seat, group }) {
    const [view, setView] = useState(null), [message, setMessage] = useState('Checking your Tinkercad assignment.'), [checking, setChecking] = useState(false)
    const alive = useRef(true), sequence = useRef(0), busy = useRef(false)
    useEffect(() => { const sequenceRef = sequence; alive.current = true; return () => { alive.current = false; sequenceRef.current++ } }, [])
    async function refresh() {
        if (busy.current) return
        busy.current = true; setChecking(true); const ticket = ++sequence.current
        try {
            const path = '/api/workshop/guest/tinkercad?homeGroup=' + group
            let result = await classroomRequest(path)
            if (result.status === 'ready') result = await classroomRequest(path, 'POST', { expectedSeat: seat })
            if (!alive.current || ticket !== sequence.current) return
            if (result.status === 'assigned' && !/^https:\/\/www\.tinkercad\.com\/joinclass\/[a-z0-9-]+$/i.test(result.classLink || '')) throw Error('Your teacher needs to check the class link.')
            setView(result); setMessage(messages[result.status] || '')
        } catch (error) { if (alive.current && ticket === sequence.current) { setView(null); setMessage(error.message) } return false }
        finally { busy.current = false; if (alive.current && ticket === sequence.current) setChecking(false) }
    }
    useClassPolling(refresh, 'tinkercad:' + seat)
    return <section className="mt-8 max-w-2xl ph-mask ph-no-capture" aria-label="Tinkercad"><h2 className="text-3xl font-bold">Tinkercad</h2><p className="mt-3">Use your Student ID to open the class and continue your model.</p>
        {message && <p role="status" aria-live="polite" className="border rounded-xl p-5 mt-5">{message}</p>}
        {view?.status === 'awaiting-approval' && <p className="mt-3">Already have a Student ID? Choose “Leave class”, then “Sign in with Student ID”. Use your original Student ID and Class ID to return to your saved work.</p>}
        {view?.status !== 'assigned' && <button type="button" className="formWhiteButton mt-3" style={{ minHeight: 44 }} disabled={checking} onClick={refresh}>{checking ? 'Checking…' : 'Check again'}</button>}
        {view?.status === 'assigned' && <div className="border rounded-xl p-6 mt-6"><h3 className="text-xl font-semibold">Your Tinkercad access</h3><CopyField label="Class ID" id="tinkercad-class-id" value={view.classId || new URL(view.classLink).pathname.split('/').pop()} /><CopyField label="Student ID" id="tinkercad-student-login" value={view.studentLogin} privateValue /><p className="text-sm mt-2">This is your Tinkercad Student login. Keep it private. Use this Student ID and Class ID to return to your FIT work from another browser or device.</p><a className="formBlackButton mt-5" href={view.classLink} target="_blank" rel="noopener noreferrer">Open Tinkercad</a><ol className="list-decimal pl-5 space-y-3 mt-5"><li>Open the Tinkercad class page.</li><li>Choose “Join with Student login” and enter your Student ID exactly as shown above.</li><li>Start your model, then return here for feedback and refinement.</li></ol></div>}
        <details className="mt-5 text-sm"><summary>Session details for teacher support</summary><CopyField label="Session ID" id="tinkercad-session-id" value={seat.replace(/^guest_/, '')} /><p className="mt-2">This Session ID is only a support reference. Use your Student ID to sign in.</p></details><p className="text-sm mt-5">If you have not received a Student ID, ask your teacher to check your assignment.</p>
    </section>
}
