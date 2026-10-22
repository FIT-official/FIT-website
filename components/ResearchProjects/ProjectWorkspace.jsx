'use client'

import StudentWorkspace from './StudentWorkspace'
import { TeacherWorkspace } from './TeacherPanel'
import styles from './ResearchProjects.module.css'

// `project` is public content only. It arrives as a prop from a server component that has already
// confirmed access, so nothing protected exists in the client bundle. `viewer` is an opaque key for
// the signed-in account; every API response must echo it, otherwise the page stops saving.
export default function ProjectWorkspace({ project, role, viewer, classIds }) {
  return (
    <div className={styles.workspace} data-role={role}>
      <header className={styles.projectHeader}>
        <p className={styles.eyebrow}>RESEARCH PROJECT</p>
        <h1>{project.title}</h1>
        <p className={styles.lead}>{project.summary}</p>
      </header>
      {role === 'teacher'
        ? <TeacherWorkspace key={viewer} project={project} viewer={viewer} classIds={classIds || []} />
        : <StudentWorkspace key={viewer} project={project} viewer={viewer} />}
    </div>
  )
}
