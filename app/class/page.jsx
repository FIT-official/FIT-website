import Link from 'next/link'
import ActivityArt from '@/components/sims/ActivityArt'
import styles from './class.module.css'

export const metadata = {
  title: 'Class | FIT Learning Studio',
  description: 'Explore maths and physics through interactive FIT experiments and games.',
  alternates: { canonical: '/class' },
}

export default function ClassPage() {
  return <main className={styles.hub}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Class</span></nav>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>FIT LEARNING STUDIO</p>
      <h1>Class</h1>
      <p>Make a prediction. Try an idea. Discover something new.</p>
    </header>
    <section className={styles.sections} aria-label="Explore Class">
      <Link className={styles.card} href="/class/simulations" aria-labelledby="simulations-heading" aria-describedby="simulations-description">
        <div className={styles.art} aria-hidden="true"><ActivityArt id="sampling" accent="#c97913" /></div>
        <div className={styles.cardBody}>
          <p className={styles.eyebrow}>EXPLORE AND PLAY</p>
          <h2 id="simulations-heading">Simulations</h2>
          <p id="simulations-description">Explore maths and physics through interactive experiments and games. Change a variable, test your prediction and see what happens.</p>
          <span className={styles.action}>Explore simulations <span aria-hidden="true">↗</span></span>
        </div>
      </Link>
      <p className={styles.comingSoon}>More coming soon.</p>
    </section>
  </main>
}
