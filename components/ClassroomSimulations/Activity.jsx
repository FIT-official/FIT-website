'use client'

import Link from 'next/link'
import { useState } from 'react'
import GameShell from '@/components/sims/GameShell'
import AddToClass from '@/components/sims/AddToClass'
import { createEmbedSnippet, getEmbedPath } from '@/lib/sims/embed'
import styles from './library.module.css'

export default function Activity({ activity }) {
  const [snippet, setSnippet] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const source = `/simulations/${activity.id}`
  async function copyEmbed() {
    const markup = createEmbedSnippet(activity.id, window.location.origin)
    setSnippet(markup)
    try { await navigator.clipboard.writeText(markup); setCopyStatus('Player snippet copied.') }
    catch { setCopyStatus('Select the snippet below to copy it manually.') }
  }
  return <main className={styles.activity}>
    <Link className={styles.back} href="/classes/simulations">← All experiments</Link>
    <div className={styles.activityMeta}><span className={styles.levelTag}>{activity.level}</span><span>{activity.subject}</span><span>{activity.topic}</span><span>{activity.minutes} min</span></div>
    <h1>{activity.title}</h1><p className={styles.activityLead}>{activity.approach}</p>
    <div className={styles.activityPrompt}><p className={styles.eyebrow}>YOUR INVESTIGATION</p><p>{activity.activityPrompt}</p></div>
    <GameShell activity={activity}/>
    <div className={styles.actions}><AddToClass simId={activity.id}/><a href={source} target="_blank" rel="noopener noreferrer">Open full-page activity ↗</a><a href={getEmbedPath(activity.id)} target="_blank" rel="noopener noreferrer">Open compact player ↗</a></div>
    <details open><summary>Explore and explain</summary><p>{activity.prediction}</p><ol>{activity.steps.map(step => <li key={step}>{step}</li>)}</ol><p><strong>Explain:</strong> {activity.transfer}</p></details>
    <details><summary>Theory and model assumptions</summary><p className={styles.model}>{activity.model}</p></details>
    <details><summary>Teacher guidance</summary><p>{activity.teacher}</p><p>Expected time: {activity.minutes} minutes. The {activity.level} level is a starting point to adapt to your learners; syllabus references are awaiting review. Classroom learning outcomes have not yet been evaluated.</p></details>
    <section className={styles.embedPanel} aria-labelledby="embed-heading"><div><p className={styles.eyebrow}>SHARE AN EXPERIMENT</p><h2 id="embed-heading">Add the player to a FIT lesson</h2><p className={styles.embedHelp}>The compact player works inside FIT pages on the same origin. External websites can link to the full-page activity; external iframe hosting is not enabled.</p></div><button className={styles.copyButton} type="button" onClick={copyEmbed}>{copyStatus === 'Player snippet copied.' ? 'Copied ✓' : 'Copy player snippet'}</button><p className={styles.copyStatus} role="status">{copyStatus}</p>{snippet && <div className={styles.snippetWrap}><label htmlFor="embed-snippet">Same-origin iframe HTML</label><textarea id="embed-snippet" className={styles.snippet} value={snippet} readOnly onFocus={event => event.target.select()}/></div>}</section>
  </main>
}
