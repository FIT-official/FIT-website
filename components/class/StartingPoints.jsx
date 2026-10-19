'use client'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import styles from './ClassHub.module.css'

// The list is chosen by FIT and is identical for everyone. FIT holds no saved preferences or class enrolments for accounts yet,
// so nothing is labelled personal or AI-picked. When the account is signed in the note says exactly that; if real preference
// data is added later this component is where it would be surfaced, and its label must change with it.
export default function StartingPoints({ items }) {
  const { isLoaded, isSignedIn } = useUser()
  return <section className={styles.block} aria-labelledby="starting-heading">
    <h2 id="starting-heading">Good places to start</h2>
    <p className={styles.blockNote} data-testid="starting-basis">{isLoaded && isSignedIn
      ? 'Chosen by FIT. You are signed in, but FIT does not hold saved preferences or class enrolments for your account yet, so everyone sees this same list.'
      : 'Chosen by FIT, the same for every visitor.'}</p>
    <ul className={styles.cards}>{items.map(item => <li key={item.slug}><Link className={styles.classCard} href={'/class/classes/' + item.slug}>
      <span className={styles.tag}>{item.level} · {item.subject}</span><strong>{item.title}</strong><span>{item.summary}</span><span className={styles.action}>See the class <span aria-hidden="true">→</span></span></Link></li>)}</ul>
  </section>
}
