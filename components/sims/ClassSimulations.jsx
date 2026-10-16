'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { classSimulations } from '@/lib/sims/classroom'
import styles from './ClassSimulations.module.css'

const ClassPlayer = dynamic(() => import('./GameShellStage'), {
    ssr: false,
    loading: () => <p className={styles.loading} role="status">Opening the experiment…</p>,
})

function ClassSimulationPlayer({ activity }) {
    const boundary = useRef(null)
    const [opened, setOpened] = useState(false)
    useEffect(() => {
        if (typeof IntersectionObserver === 'undefined') { setOpened(true); return }
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) { setOpened(true); observer.disconnect() }
        })
        if (boundary.current) observer.observe(boundary.current)
        return () => observer.disconnect()
    }, [])
    return <div ref={boundary} className={styles.player}>
        {opened ? <ClassPlayer activity={activity} source={'/embed/sims/' + encodeURIComponent(activity.id)} title={activity.title + ' simulation'} /> : <p className={styles.loading}>The experiment opens when it comes into view.</p>}
    </div>
}

export default function ClassSimulations({ simIds = [], teacher = false, busy = false, onRemove }) {
    const activities = classSimulations({ simIds })
    if (!activities.length && !teacher) return null
    return <section className={styles.section} aria-label="Class simulations">
        <header className={styles.heading}>
            <div><p className={styles.eyebrow}>Explore together</p><h2>Class simulations</h2><p>Try a prediction, change one thing, and explain what you notice.</p></div>
            {teacher && <Link className={styles.button} href="/classes/simulations">Choose activities <span aria-hidden="true">↗</span></Link>}
        </header>
        {!activities.length && <p className={styles.empty}>Choose a simulation from the library to share with this class.</p>}
        {activities.map(activity => <article className={styles.activity} key={activity.id}>
            <div className={styles.activityHeader}>
                <div><span className={styles.tag}>{activity.level} · {activity.subject}</span><h3>{activity.title}</h3></div>
                {teacher && onRemove && <button type="button" className={styles.remove} disabled={busy} onClick={() => onRemove(activity.id)} aria-label={'Remove ' + activity.title + ' from class'}>Remove from class</button>}
            </div>
            <p className={styles.prompt}><strong>Your activity</strong>{activity.activityPrompt}</p>
            <ClassSimulationPlayer activity={activity} />
            <Link className={styles.textLink} href={'/classes/simulations/' + activity.id} target="_blank" rel="noopener noreferrer">Open {activity.title} in a full page <span aria-hidden="true">↗</span></Link>
        </article>)}
    </section>
}
