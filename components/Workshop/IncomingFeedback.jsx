'use client'
import { useState } from 'react'
const labels = { whatWorks: 'What works', question: 'Questions', improvement: 'Suggestions' }
export default function IncomingFeedback({ lesson }) {
    const [reviewer, setReviewer] = useState('all')
    const incoming = lesson.feedback.filter(row => row.presentingGroup === lesson.group), rows = incoming.filter(row => reviewer === 'all' || row.visitingGroup === reviewer)
    const reviewers = [...new Set(incoming.map(row => row.visitingGroup))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    return <section className="mt-5" aria-labelledby="incoming-title"><h3 id="incoming-title" className="text-xl">Feedback for your project</h3>
        {!lesson.showFeedback ? <p>The teacher has not opened peer feedback yet.</p> : <><p className="mt-2">{incoming.length} visible comments from {reviewers.length} reviewer groups. These are individual contributions, not a group consensus.</p>
            <label className="block mt-3">Reviewer group<select className="formInput block" value={reviewer} onChange={event => setReviewer(event.target.value)}><option value="all">All reviewer groups</option>{reviewers.map(group => <option key={group} value={group}>Group {group.slice(1)}</option>)}</select></label>
            {[1, 2].map(idea => { const comments = rows.filter(row => row.idea === String(idea)); return <section key={idea} className="border rounded-xl p-4 mt-4"><h4 className="font-semibold">Idea {idea} · {comments.length} comments</h4>{!comments.length ? <p>No visible comments for this idea with the selected filter.</p> : <><p className="text-sm mt-2">Questions to consider: {comments.filter(row => row.question.trim()).length} · suggested improvements: {comments.filter(row => row.improvement.trim()).length}</p>
                {Object.entries(labels).map(([field, label]) => <div key={field} className="mt-4"><h5 className="font-semibold">{label}</h5>{comments.map(row => <blockquote key={row.id} className="border-l-2 pl-3 mt-3"><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row[field]}</p><footer className="text-sm mt-1">Reviewer Group {row.visitingGroup.slice(1)} · response {row.id.slice(-8)}</footer></blockquote>)}</div>)}
            </>}</section> })}
        </>}
    </section>
}
