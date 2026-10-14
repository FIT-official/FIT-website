'use client'
import Link from 'next/link'
import { useState } from 'react'
import styles from './library.module.css'

export default function Activity({ activity }) {
  const [snippet, setSnippet] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const source = `/simulations/${activity.id}`
  async function copyEmbed() {
    const markup = `<iframe src="${window.location.origin}${source}?embed=1" title="FIT: ${activity.title}" width="100%" height="1400" style="border:0;max-width:1200px" loading="lazy" referrerpolicy="no-referrer" allowfullscreen></iframe>`
    setSnippet(markup)
    try { await navigator.clipboard.writeText(markup); setCopyStatus('Same-origin player snippet copied.') }
    catch { setCopyStatus('Select the snippet below to copy it manually.') }
  }
  return <main className={styles.activity}>
    <Link className={styles.back} href="/classes/simulations">← All experiments</Link>
    <p className={styles.eyebrow}>{activity.subjects.join(' · ')} / {activity.level} / Suggested age {activity.ages}</p>
    <h1>{activity.title}</h1><p className={styles.activityLead}>{activity.description}</p>
    <div className={styles.actions}><a href={source} target="_blank" rel="noopener noreferrer">Open full-page activity ↗</a><a href={`${source}?embed=1`} target="_blank" rel="noopener noreferrer">Open compact player ↗</a><button onClick={copyEmbed}>Copy FIT player snippet</button></div>
    <p className={styles.embedHelp}>This player works inside FIT pages on the same origin. External websites can use the full-page link; external iframe hosting awaits a separate framing-policy review.</p>
    <p className={styles.embedHelp} role="status">{copyStatus}</p>
    {snippet && <><label htmlFor="embed-snippet" className={styles.embedHelp}>Same-origin iframe HTML</label><textarea id="embed-snippet" className={styles.snippet} value={snippet} readOnly onFocus={e => e.target.select()} /></>}
    <iframe className={styles.activityFrame} src={`${source}?embed=1`} title={`Interactive activity: ${activity.title}`} referrerPolicy="no-referrer" allowFullScreen />
    <details open><summary>Your investigation</summary><p>{activity.prediction}</p><ol>{activity.steps.map(step => <li key={step}>{step}</li>)}</ol><p><strong>Explain:</strong> {activity.transfer}</p></details>
    <details><summary>Teacher guidance</summary><p>{activity.teacher}</p><p>Expected time: {activity.minutes} minutes. Suggested ages are assumptions to adapt to your curriculum. These activities have not yet undergone classroom learning-outcomes evaluation.</p></details>
  </main>
}
