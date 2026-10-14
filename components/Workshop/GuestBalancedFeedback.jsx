'use client'
import { useEffect, useState } from 'react'
import GuestIdeaReading from './GuestIdeaReading'
import GuestFeedbackForm from './GuestFeedbackForm'
import styles from './BalancedFeedback.module.css'

export default function GuestBalancedFeedback({ group, lesson, onRefresh }) {
    const [assignment, setAssignment] = useState(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
    const { round, projectVersion } = lesson.assignment, target = group.id, seat = lesson.seat
    useEffect(() => {
        let active = true; const controller = new AbortController(); setAssignment(null); setError('')
        fetch('/api/workshop/guest/feedback-assignment?homeGroup=' + lesson.group, { method: 'POST', cache: 'no-store', credentials: 'same-origin', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedSeat: seat, target, round, projectVersion }) }).then(async response => {
            const result = await response.json()
            if (!response.ok || result.seat !== seat || result.target !== target || result.round !== round || result.projectVersion !== projectVersion || !['1', '2'].includes(result.firstIdea)) throw Error('Assignment unavailable')
            if (active) setAssignment(result)
        }).catch(() => { if (active) setError('Your stable first task could not load. Your saved drafts are kept. Retry to continue.') })
        return () => { active = false; controller.abort() }
    }, [seat, lesson.group, target, round, projectVersion, retry])
    if (!assignment) return <section aria-label="Balanced feedback"><p role="status">{error || 'Loading your two feedback tasks.'}</p>{error && <button type="button" className="formWhiteButton mt-3" onClick={() => setRetry(value => value + 1)}>Retry feedback tasks</button>}</section>
    const order = assignment.firstIdea === '2' ? ['2', '1'] : ['1', '2']
    const completion = lesson.feedbackCompletion?.[group.id] || (group.id === target ? assignment.completed : {})
    return <section aria-label="Feedback for both ideas" className="mt-5"><p>Read both ideas. On a small screen, your assigned first idea appears first and stays the same when you return. Each idea has its own saved draft and Submit button.</p>
        <nav aria-label="Both idea feedback tasks" className={styles.links}>{['1', '2'].map(idea => <a className="formWhiteButton" key={idea} href={'#feedback-task-' + idea}>Idea {idea} · {completion[idea] ? 'Feedback submitted' : 'Feedback to do'}</a>)}</nav>
        <div className={styles.grid}>{order.map(idea => <article id={'feedback-task-' + idea} key={seat + ':' + group.id + ':' + round + ':' + idea} className={styles.card} aria-label={'Idea ' + idea + ' reading and feedback'}><p className={styles.progress}>Idea {idea} · {completion[idea] ? 'Feedback submitted' : 'Feedback to do'}</p><GuestIdeaReading group={group} idea={idea} /><a className="formBlackButton inline-block mt-4" href={'#feedback-writing-' + idea}>Give feedback on Idea {idea}</a><div id={'feedback-writing-' + idea}><GuestFeedbackForm group={group} lesson={lesson} onRefresh={onRefresh} selectedIdea={idea} fixedIdea /></div></article>)}</div>
    </section>
}
