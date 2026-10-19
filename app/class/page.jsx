import Link from 'next/link'
import ActivityArt from '@/components/sims/ActivityArt'
import ClassTabs from '@/components/class/ClassTabs'
import JoinCodeBox from '@/components/class/JoinCodeBox'
import StartingPoints from '@/components/class/StartingPoints'
import hub from '@/components/class/ClassHub.module.css'
import { computingFlag } from '@/lib/computing/flags'
import { CLASSES, availableCount, startingPoints } from '@/lib/class/catalogue'
import styles from './class.module.css'

export const metadata = {
  title: 'Class | FIT Learning Studio',
  description: 'Explore FIT classes and interactive simulations across maths, physics, chemistry, biology, computing and engineering.',
  alternates: { canonical: '/class' },
}

export default function ClassPage() {
  const computingEnabled = computingFlag('COMPUTING_ENABLED')
  return <main className={styles.hub}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Class</span></nav>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>FIT LEARNING STUDIO</p>
      <h1>Class</h1>
      <p>Short classes built around things you can try, and simulations you can play with. Pick a class, or jump straight into a simulation.</p>
    </header>
    <ClassTabs current="classes" />
    <div className={hub.lead}>
      <section aria-labelledby="classes-intro-heading">
        <h2 id="classes-intro-heading" className={styles.srOnly}>About these classes</h2>
        <p className={hub.blockNote}>Each class below lists what is ready to open today and what is still planned. Planned items have no link until they exist.</p>
        <Link className={hub.teacherButton} href="/class/teachers">For teachers: what works today</Link>
      </section>
      <JoinCodeBox />
    </div>
    <StartingPoints items={startingPoints()} />
    <section className={hub.block} aria-labelledby="all-classes-heading">
      <h2 id="all-classes-heading">All classes</h2>
      <ul className={hub.cards}>{CLASSES.map(item => <li key={item.slug}><Link className={hub.classCard} href={'/class/classes/' + item.slug}>
        <span className={hub.tag}>{item.level} · {item.subject}</span><strong>{item.title}</strong><span>{item.summary}</span>
        <span className={hub.tag}>{availableCount(item)} ready to open · {item.modules.length - availableCount(item)} planned</span></Link></li>)}</ul>
    </section>
    <section className={styles.sections} aria-label="Explore Class">
      <Link className={styles.card} href="/class/simulations" aria-labelledby="simulations-heading" aria-describedby="simulations-description">
        <div className={styles.art} aria-hidden="true"><ActivityArt id="sampling" accent="#c97913" /></div>
        <div className={styles.cardBody}>
          <p className={styles.eyebrow}>EXPLORE AND PLAY</p>
          <h2 id="simulations-heading">Simulations</h2>
          <p id="simulations-description">Interactive experiments and games across maths, science, computing and engineering.</p>
          <span className={styles.action}>Explore simulations <span aria-hidden="true">↗</span></span>
        </div>
      </Link>
      <Link className={styles.card} href="/class/programming" aria-labelledby="programming-heading" aria-describedby="programming-description">
        <div className={styles.cardBody}>
          <p className={styles.eyebrow}>CODE AND COMPUTE</p>
          <h2 id="programming-heading">Programming</h2>
          <p id="programming-description">What you can do with code today, and what is planned next.</p>
          <span className={styles.action}>See Programming <span aria-hidden="true">↗</span></span>
        </div>
      </Link>
      {computingEnabled && (
        <Link className={styles.card} href="/computing" aria-labelledby="computing-heading" aria-describedby="computing-description">
          <div className={styles.art} aria-hidden="true"><ActivityArt id="sampling" accent="#1F66E5" /></div>
          <div className={styles.cardBody}>
            <p className={styles.eyebrow}>WRITE AND RUN</p>
            <h2 id="computing-heading">Computing</h2>
            <p id="computing-description">Write and run code in your browser. Nothing to install.</p>
            <span className={styles.action}>Explore Computing <span aria-hidden="true">↗</span></span>
          </div>
        </Link>
      )}
      <p className={styles.comingSoon}>More classes are planned. They appear here only once they can be opened.</p>
    </section>
  </main>
}
