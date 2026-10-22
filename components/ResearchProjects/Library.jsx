import Link from 'next/link'
import styles from './ResearchProjects.module.css'

// Tiles for the signed-in, authorised library page. Receives summaries only (no keys, no body text). Each tile
// image is an original lesson diagram served by the authenticated assets route.
export default function Library({ projects, canReview = false }) {
  return (
    <main className={styles.library}>
      <header className={styles.projectHeader}>
        <p className={styles.eyebrow}>FIT LEARNING STUDIO</p>
        <h1>Research projects</h1>
        <p className={styles.lead}>
          Ten advanced-secondary research projects. Each has a 60-minute lesson that needs no kit, and a hardware route that stays conditional on teacher approval and equipment. Source-backed published builds are labelled separately from the proposed student investigations.
        </p>
        {canReview ? <p className={styles.note}>Review access: you can see answer keys and review saved work.</p> : null}
      </header>
      <ul className={styles.tiles}>
        {projects.map(p => (
          <li key={p.slug}>
            <Link className={styles.tile} href={'/class/projects/' + p.slug}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.tileImage} src={p.tile.src} alt={p.tile.alt} width="320" height="190" loading="lazy" />
              <span className={styles.tag}>{p.field} · {p.level}</span>
              <strong>{p.shortTitle}</strong>
              <span>{p.summary}</span>
              <span className={styles.tag}>60-minute lesson · {p.questionCount} questions · {p.todoCount} to-do items</span>
              <span className={styles.action}>Open project <span aria-hidden="true">→</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
