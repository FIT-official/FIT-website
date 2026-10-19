import Link from 'next/link'
import ClassTabs from '@/components/class/ClassTabs'
import hub from '@/components/class/ClassHub.module.css'
import classStyles from '../class.module.css'
import { computingFlag } from '@/lib/computing/flags'
import { PROGRAMMING_PLAN } from '@/lib/class/catalogue'
import { getLiveSims } from '@/lib/sims/registry'

export const metadata = {
  title: 'Programming | FIT Learning Studio',
  description: 'What you can do with code at FIT today, and the programming and AI-learning classes that are planned.',
  alternates: { canonical: '/class/programming' },
}

export default function ProgrammingPage() {
  const computingEnabled = computingFlag('COMPUTING_ENABLED')
  const computingCount = getLiveSims().filter(sim => sim.subject === 'Computing').length
  const computing = computingCount > 0 ? { count: computingCount } : null
  return <main className={classStyles.hub}>
    <nav className={classStyles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><Link href="/class">Class</Link><span aria-hidden="true">/</span><span aria-current="page">Programming</span></nav>
    <ClassTabs current="programming" />
    <article className={hub.detail}>
      <h1>Programming</h1>
      <p>This page separates what you can use now from what is only planned. No programming course is open yet; the complete lessons are scheduled for a later phase.</p>
      <h2>Available now</h2>
      <ul className={hub.modules}>
        {computing && <li className={hub.module} data-status="available"><div><strong><Link className={hub.planLink} href="/class/simulations">Computing simulations</Link></strong><p>{computing.count} browser {computing.count === 1 ? 'activity' : 'activities'} in the simulation library.</p></div><span className={hub.status} data-status="available">Ready to open</span></li>}
        {computingEnabled && <li className={hub.module} data-status="available"><div><strong><Link className={hub.planLink} href="/computing">Computing workspace</Link></strong><p>Write and run code in your browser.</p></div><span className={hub.status} data-status="available">Ready to open</span></li>}
        {!computing && !computingEnabled && <li className={hub.module} data-status="planned"><div><strong>Nothing to open yet</strong></div><span className={hub.status} data-status="planned">Planned, not available yet</span></li>}
      </ul>
      <h2>Planned</h2>
      <ul className={hub.modules}>
        {PROGRAMMING_PLAN.filter(entry => entry.status === 'planned' || (entry.status === 'flagged' && !computingEnabled)).map(entry => <li key={entry.title} className={hub.module} data-status="planned"><div><strong>{entry.title}</strong><p>{entry.note}</p></div><span className={hub.status} data-status="planned">Planned, not available yet</span></li>)}
      </ul>
    </article>
  </main>
}
