'use client'
import { useState } from 'react'
const labels = { whatWorks: 'What works well, and why?', question: 'Questions for the presenters', improvement: 'Suggested improvements' }
export default function IncomingFeedback({ lesson }) {
    const [reviewer, setReviewer] = useState('all')
    const incoming = lesson.feedback.filter(row => row.presentingGroup === lesson.group)
    const reviewers = [...new Set(incoming.map(row => row.visitingGroup))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    const selectedReviewer = reviewer === 'all' || reviewers.includes(reviewer) ? reviewer : 'all'
    const rows = incoming.filter(row => selectedReviewer === 'all' || row.visitingGroup === selectedReviewer).sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt) || a.id.localeCompare(b.id))
    return <section className="ph-mask ph-no-capture border rounded-xl p-5 mt-8" aria-label={'Incoming feedback for Home Group ' + lesson.group.slice(1)}>
        <h3 className="text-2xl">Feedback received by Home Group {lesson.group.slice(1)}</h3>
        <p className="mt-3">{incoming.length} visible responses from {reviewers.length} reviewer groups. These are their original answers, shown oldest first; each contribution stays attributed. Changing your outgoing target does not change this panel.</p>
        <label className="block mt-4">Reviewer group<select className="formInput block w-full" value={selectedReviewer} onChange={event => setReviewer(event.target.value)}><option value="all">All reviewer groups</option>{reviewers.map(group => <option key={group} value={group}>Group {group.slice(1)}</option>)}</select></label>
        {!lesson.showFeedback && <p className="mt-3">The teacher has closed class feedback visibility.</p>}
        <div className="grid lg:grid-cols-3 gap-5 mt-5">{Object.entries(labels).map(([field, label]) => <section key={field} aria-label={label}>
            <h4 className="text-xl">{label}</h4><p className="text-sm mt-2">{rows.length} answers with the selected reviewer filter.</p>
            {!rows.length ? <p className="mt-3">No visible answers yet.</p> : <ol className="space-y-4 mt-4">{rows.map(row => <li key={row.id} className="border rounded-lg p-4">
                <blockquote style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row[field]}</blockquote>
                <p className="text-sm mt-3">Reviewer Group {row.visitingGroup.slice(1)} | Session {row.seat?.slice(-6) || 'unavailable'} | Idea {row.idea}</p>
                <p className="text-sm mt-1">{new Date(row.recordedAt).toLocaleString()} | response {row.id.slice(-8)}</p>
            </li>)}</ol>}
        </section>)}</div>
    </section>
}
