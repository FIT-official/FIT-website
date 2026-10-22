import Link from 'next/link'
import styles from './ResearchProjects.module.css'

// Tiles for the signed-in, authorised library page. Receives summaries only (no keys, no body text).
export default function Library({ projects, role }) {
  return (
    <main className={styles.library}>
      <header className={styles.projectHeader}>
        <p className={styles.eyebrow}>FIT LEARNING STUDIO</p>
        <h1>Research projects</h1>
        <p className={styles.lead}>
          Seven advanced-secondary research projects. Each one pairs a source-backed published build with a clearly labelled, proposed student investigation: a bounded question, a model, a measured dataset, uncertainty and one justified improvement.
        </p>
        {role === 'teacher' ? <p className={styles.note}>Teacher view: you can open any project, see the answer keys and review team records.</p> : null}
      </header>
      <ul className={styles.tiles}>
        {projects.map(p => (
          <li key={p.slug}>
            <Link className={styles.tile} href={'/class/projects/' + p.slug}>
              <span className={styles.tag}>{p.field} · {p.level}</span>
              <strong>{p.shortTitle}</strong>
              <span>{p.summary}</span>
              <span className={styles.tag}>{p.questionCount} questions · {p.todoCount} to-do items</span>
              <span className={styles.action}>Open project <span aria-hidden="true">→</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
