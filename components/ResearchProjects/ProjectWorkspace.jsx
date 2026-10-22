'use client'

import Link from 'next/link'
import StudentWorkspace from './StudentWorkspace'
import { TeacherWorkspace } from './TeacherPanel'
import styles from './ResearchProjects.module.css'

// `project` is public content only. It arrives as a prop from a server component that has already
// confirmed access, so nothing protected exists in the client bundle. `viewer` is an opaque key for
// the signed-in account; every API response must echo it, otherwise the page stops saving.
export default function ProjectWorkspace({ project, role, viewer, classIds, canReview = false }) {
  return (
    <div className={styles.workspace} data-role={role}>
      <header className={styles.projectHeader}>
        <p className={styles.eyebrow}>RESEARCH PROJECT</p>
        <h1>{project.title}</h1>
        <p className={styles.lead}>{project.summary}</p>
      </header>
      {canReview && <nav className="mb-6 flex flex-wrap gap-5 rounded-lg border border-borderColor p-4 underline" aria-label="Project workspace">
        <Link href={`/class/projects/${project.slug}`} aria-current={role === 'student' ? 'page' : undefined}>My project work</Link>
        <Link href={`/class/projects/${project.slug}?view=review`} aria-current={role === 'teacher' ? 'page' : undefined}>Review and answer keys</Link>
        <Link href="/admin/advanced-classes">View access</Link>
      </nav>}
      {role === 'teacher'
        ? <TeacherWorkspace key={viewer} project={project} viewer={viewer} classIds={classIds || []} />
        : <StudentWorkspace key={viewer} project={project} viewer={viewer} />}
    </div>
  )
}
