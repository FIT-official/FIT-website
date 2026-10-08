'use client'
import { useEffect, useRef, useState } from 'react'
import { classroomRequest } from './Classroom'
import { useClassPolling } from './useClassPolling'
import CopyField from './CopyField'

const messages = { 'not-ready': 'Your teacher is preparing the Tinkercad class.', 'awaiting-approval': 'Ask your teacher to approve this class session. Your login will appear here.', paused: 'New Tinkercad assignments are paused. Ask your teacher when to begin.', exhausted: 'All available Tinkercad logins are assigned. Ask your teacher for help.' }
export default function GuestTinkercad({ seat, group }) {
    const [view, setView] = useState(null), [message, setMessage] = useState('Checking your Tinkercad assignment.')
    const alive = useRef(true), sequence = useRef(0), busy = useRef(false)
    useEffect(() => { const sequenceRef = sequence; alive.current = true; return () => { alive.current = false; sequenceRef.current++ } }, [])
    async function refresh() {
        if (busy.current) return
        busy.current = true; const ticket = ++sequence.current
        try {
            const path = '/api/workshop/guest/tinkercad?homeGroup=' + group
            let result = await classroomRequest(path)
            if (result.status === 'ready') result = await classroomRequest(path, 'POST', { expectedSeat: seat })
            if (!alive.current || ticket !== sequence.current) return
            if (result.status === 'assigned' && !/^https:\/\/www\.tinkercad\.com\/joinclass\/[a-z0-9-]+$/i.test(result.classLink || '')) throw Error('Your teacher needs to check the class link.')
            setView(result); setMessage(messages[result.status] || '')
        } catch (error) { if (alive.current && ticket === sequence.current) { setView(null); setMessage(error.message) } return false }
        finally { busy.current = false }
    }
    useClassPolling(refresh, 'tinkercad:' + seat)
    return <section className="mt-8 max-w-2xl ph-mask ph-no-capture" aria-label="Tinkercad"><h2 className="text-3xl font-bold">Tinkercad</h2><p className="mt-3">Use your assigned Student login to open the class and start your model.</p>
        {message && <p role="status" aria-live="polite" className="border rounded-xl p-5 mt-5">{message}</p>}
        {view?.status === 'assigned' && <div className="border rounded-xl p-6 mt-6"><h3 className="text-xl font-semibold">Your Tinkercad access</h3><CopyField label="Class ID" id="tinkercad-class-id" value={view.classId || new URL(view.classLink).pathname.split('/').pop()} /><CopyField label="Student login" id="tinkercad-student-login" value={view.studentLogin} privateValue /><p className="text-sm mt-2">Keep using this login when you return in the same class session.</p><a className="formBlackButton mt-5" href={view.classLink} target="_blank" rel="noopener noreferrer">Open Tinkercad</a><ol className="list-decimal pl-5 space-y-3 mt-5"><li>Open the Tinkercad class page.</li><li>Enter your Student login exactly as shown above.</li><li>Start your model, then return here for feedback and refinement.</li></ol></div>}
        <CopyField label="Session ID" id="tinkercad-session-id" value={seat.replace(/^guest_/, '')} /><p className="text-sm mt-5">A new class session needs a new teacher-approved assignment. Ask your teacher if you need help signing in.</p>
    </section>
}
