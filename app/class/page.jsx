import Link from 'next/link'
import ActivityArt from '@/components/sims/ActivityArt'
import { computingFlag } from '@/lib/computing/flags'
import styles from './class.module.css'

export const metadata = {
  title: 'Class | FIT Learning Studio',
  description: 'Explore maths and physics through interactive FIT experiments and games.',
  alternates: { canonical: '/class' },
}

export default function ClassPage() {
  const computingEnabled = computingFlag('COMPUTING_ENABLED')

  return <main className={styles.hub}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Class</span></nav>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>FIT LEARNING STUDIO</p>
      <h1>Class</h1>
    </header>
    <section className={styles.sections} aria-label="Explore Class">
      <Link className={styles.card} href="/class/simulations" aria-labelledby="simulations-heading" aria-describedby="simulations-description">
        <div className={styles.art} aria-hidden="true"><ActivityArt id="sampling" accent="#c97913" /></div>
        <div className={styles.cardBody}>
          <p className={styles.eyebrow}>EXPLORE AND PLAY</p>
          <h2 id="simulations-heading">Simulations</h2>
          <p id="simulations-description">Interactive maths and physics experiments and games.</p>
          <span className={styles.action}>Explore simulations <span aria-hidden="true">↗</span></span>
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
      <p className={styles.comingSoon}>More coming soon.</p>
    </section>
  </main>
}
