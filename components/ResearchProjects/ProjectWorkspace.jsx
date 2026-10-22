'use client'

import { useState } from 'react'
import StudentWorkspace from './StudentWorkspace'
import { TeacherWorkspace } from './TeacherPanel'
import styles from './ResearchProjects.module.css'

// `project` is public lesson content only. It arrives as a prop from a server component that has already
// confirmed access, so nothing protected exists in the client bundle. `viewer` is an opaque key for the signed-in
// account; every API response must echo it, otherwise the page stops saving.
//   hasPersonal  the account has its own saved work (answers, data, to-do, submission)
//   canReview    the account may also review records, give feedback and see answer keys
// An account with both can switch between the two modes. An account with only one sees only that mode.
export default function ProjectWorkspace({ project, canReview = false, hasPersonal = false, viewer, classIds }) {
  const [mode, setMode] = useState(hasPersonal ? 'personal' : 'review')
  const active = mode === 'review' && canReview ? 'review' : 'personal'
  return (
    <div className={styles.workspace} data-mode={active}>
      <header className={styles.projectHeader}>
        <p className={styles.eyebrow}>RESEARCH PROJECT</p>
        <h1>{project.title}</h1>
        <p className={styles.lead}>{project.summary}</p>
        {canReview && hasPersonal ? (
          <div className={styles.modeSwitch} role="group" aria-label="Choose a mode">
            <button type="button" className={styles.secondary} aria-pressed={active === 'personal'} onClick={() => setMode('personal')}>My work</button>
            <button type="button" className={styles.secondary} aria-pressed={active === 'review'} onClick={() => setMode('review')}>Review</button>
          </div>
        ) : null}
      </header>
      {active === 'review'
        ? <TeacherWorkspace key={viewer + ':review'} project={project} viewer={viewer} classIds={classIds || []} />
        : <StudentWorkspace key={viewer + ':personal'} project={project} viewer={viewer} />}
    </div>
  )
}
