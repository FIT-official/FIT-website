import Link from 'next/link'
import styles from './ClassHub.module.css'

// Real links, not an ARIA tablist: each tab is its own page, so Tab/Enter and the browser Back button behave normally.
export const CLASS_TABS = [
  { key: 'classes', label: 'Classes', href: '/class' },
  { key: 'simulations', label: 'Simulations', href: '/class/simulations' },
  { key: 'programming', label: 'Programming', href: '/class/programming' },
]

export default function ClassTabs({ current }) {
  return <nav className={styles.tabs} aria-label="Class sections">
    <ul>{CLASS_TABS.map(tab => <li key={tab.key}><Link className={styles.tab} href={tab.href} aria-current={tab.key === current ? 'page' : undefined}>{tab.label}</Link></li>)}</ul>
    <Link className={styles.teacherButton} href="/class/teachers">For teachers</Link>
  </nav>
}
