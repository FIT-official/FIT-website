'use client'

import { useState } from 'react'
import ProjectBody from './ProjectBody'
import { useProjectRecord, useKeys, describeDifference } from './useProjectRecord'
import { makeRow, STATUS_LABELS } from '@/lib/researchProjects/shared'
import { LIMITS } from '@/lib/researchProjects/config'
import styles from './ResearchProjects.module.css'

const SYNC_TEXT = {
  saved: 'All changes saved',
  saving: 'Saving…',
  offline: 'Offline: changes are kept on this device',
  error: 'Not saved',
  conflict: 'Conflict: nothing was overwritten',
  locked: 'Locked: this record cannot be edited now',
  account: 'Signed in as a different account',
}

const formatTime = iso => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '')

function ConflictPanel({ conflict, onTheirs, onMine }) {
  const differences = describeDifference(conflict.mine, conflict.current.doc)
  return (
    <div className={styles.conflict} role="alert">
      <h3>Your team’s record changed</h3>
      <p>
        {conflict.origin === 'device'
          ? 'Edits saved on this device were made on an older version of the record.'
          : 'Someone saved a newer version while you were editing.'}
        {' '}Latest saved version: revision {conflict.current.revision}
        {conflict.current.updatedBy ? `, last edited by ${conflict.current.updatedBy.label}` : ''}
        {conflict.current.updatedAt ? ` on ${formatTime(conflict.current.updatedAt)}` : ''}. Nothing was overwritten.
      </p>
      <p>{differences.length ? `Differences between the two versions: ${differences.join('; ')}.` : 'The two versions are the same apart from their revision.'}</p>
      <div className={styles.buttonRow}>
        <button type="button" className={styles.secondary} onClick={onTheirs}>Use the latest saved version (discard my unsaved edits)</button>
        <button type="button" className={styles.primary} onClick={onMine}>Keep my edits and save them on top of the latest</button>
      </div>
      <p className={styles.note}>Choosing “keep my edits” replaces the team’s latest version with yours when it saves. Decide together if you are unsure.</p>
    </div>
  )
}

function Feedback({ server }) {
  const entries = [...server.feedback].reverse()
  return (
    <section className={styles.section} id="feedback" aria-labelledby="feedback-h">
      <h2 id="feedback-h">Teacher feedback and history</h2>
      {entries.length === 0 ? <p className={styles.empty}>No feedback yet.</p> : (
        <ol className={styles.feedback}>
          {entries.map(f => (
            <li key={f.id}>
              <p><strong>{f.by}</strong> · {formatTime(f.at)} · <span className={styles.badge} data-source={f.kind === 'accept' ? 'simulation' : 'measured'}>{f.kind === 'revision' ? 'Revision requested' : f.kind === 'accept' ? 'Accepted' : 'Comment'}</span></p>
              {Object.keys(f.rubric || {}).length ? <p className={styles.note}>Rubric scores: {Object.entries(f.rubric).map(([k, v]) => `${k} ${v}/4`).join(', ')}</p> : null}
              {f.comment ? <p>{f.comment}</p> : null}
            </li>
          ))}
        </ol>
      )}
      <h3>History</h3>
      <ul className={styles.history}>
        {server.events.map((e, i) => <li key={i}>{formatTime(e.at)} · {e.type.replaceAll('_', ' ')} · {e.by}</li>)}
      </ul>
    </section>
  )
}

export default function StudentWorkspace({ project, viewer }) {
  const rec = useProjectRecord({ slug: project.slug, viewer })
  const keys = useKeys(project.slug)
  const [showConfirm, setShowConfirm] = useState(false)
  const { server, doc, edit } = rec

  if (rec.phase === 'loading') return <p role="status" className={styles.loading}>Loading your team’s record…</p>
  if (rec.phase === 'account') {
    return (
      <div className={styles.notice} role="alert">
        <h2>Signed in as a different account</h2>
        <p>{rec.message}</p>
        <button type="button" className={styles.primary} onClick={() => window.location.reload()}>Reload the page</button>
      </div>
    )
  }
  if (rec.phase === 'denied') return <div className={styles.notice} role="alert"><h2>Not available</h2><p>{rec.message}</p></div>
  if (rec.phase === 'error' || !server) {
    return (
      <div className={styles.notice} role="alert">
        <h2>Could not load your record</h2>
        <p>{rec.message}</p>
        <button type="button" className={styles.primary} onClick={rec.reload}>Try again</button>
      </div>
    )
  }

  const canMeasure = server.safetyApproved
  const locked = !rec.editable

  return (
    <div>
      <div className={styles.statusBar} role="region" aria-label="Save status and submission">
        <div>
          <p className={styles.syncState} role="status" aria-live="polite" data-state={rec.sync}>
            {rec.sync === 'saved' && rec.dirty ? 'Unsaved changes' : SYNC_TEXT[rec.sync]}
            {rec.sync === 'saved' && !rec.dirty && server.revision > 0 ? ` (revision ${server.revision})` : ''}
          </p>
          <p className={styles.note}>
            Record: <span className={styles.badge} data-source={server.status === 'accepted' ? 'simulation' : 'measured'}>{STATUS_LABELS[server.status]}</span>
            {server.updatedBy ? ` · last edited by ${server.updatedBy.label} ${formatTime(server.updatedAt)}` : ' · not saved yet'}
            {!rec.online ? ' · you are offline' : ''}
          </p>
        </div>
        <div className={styles.buttonRow}>
          <button type="button" className={styles.secondary} onClick={rec.saveNow} disabled={rec.sync === 'saving' || (!rec.dirty && rec.sync !== 'error' && rec.sync !== 'offline') || !rec.editable}>
            {rec.sync === 'error' || rec.sync === 'offline' ? 'Retry save' : 'Save now'}
          </button>
          <button type="button" className={styles.primary} disabled={locked || rec.sync === 'saving' || (server.revision === 0 && !rec.dirty)}
            onClick={() => setShowConfirm(true)}>
            {server.status === 'revision_requested' ? 'Resubmit for review' : 'Submit for review'}
          </button>
        </div>
        {rec.message ? <p className={styles.statusMessage} role={rec.sync === 'error' ? 'alert' : 'status'}>{rec.message}</p> : null}
        {rec.sync === 'account' ? <button type="button" className={styles.secondary} onClick={() => window.location.reload()}>Reload the page</button> : null}
        {rec.problems.length ? (
          <div role="alert" className={styles.problems}>
            <p><strong>Before you can submit:</strong></p>
            <ul>{rec.problems.map(p => <li key={p}>{p}</li>)}</ul>
          </div>
        ) : null}
        {showConfirm ? (
          <div className={styles.confirm} role="group" aria-label="Confirm submission">
            <p>Submit this record to your teacher? You cannot edit it until your teacher accepts it or asks for a revision.</p>
            <div className={styles.buttonRow}>
              <button type="button" className={styles.primary} onClick={async () => { setShowConfirm(false); await rec.submit() }}>Yes, submit</button>
              <button type="button" className={styles.secondary} onClick={() => setShowConfirm(false)}>Not yet</button>
            </div>
          </div>
        ) : null}
        {server.status === 'submitted' ? <p className={styles.note}>Submitted. Your teacher will accept it or ask for a revision.</p> : null}
        {server.status === 'revision_requested' ? <p className={styles.note}>Your teacher asked for a revision: read the feedback, change your record, then resubmit.</p> : null}
        {server.status === 'accepted' ? <p className={styles.note}>Accepted. The record is now read-only.</p> : null}
      </div>

      {rec.conflict ? <ConflictPanel conflict={rec.conflict} onTheirs={rec.acceptTheirs} onMine={rec.keepMine} /> : null}

      <ProjectBody
        project={project}
        doc={doc}
        editable={rec.editable}
        canMeasure={canMeasure}
        simDisabledReason={locked ? 'The record is locked, so results cannot be added right now.' : ''}
        onToggle={id => edit(d => {
          const todo = { ...d.todo }
          if (todo[id]) delete todo[id]
          else todo[id] = true
          return { ...d, todo }
        })}
        onPlan={(field, value) => edit(d => ({ ...d, plan: { ...d.plan, [field]: value } }))}
        onAnswer={(id, patch) => edit(d => ({ ...d, answers: { ...d.answers, [id]: { ...d.answers[id], ...patch } } }))}
        onDataset={rows => edit(d => ({ ...d, dataset: rows }))}
        onAddSimRow={cells => edit(d => (d.dataset.length >= LIMITS.datasetRows ? d : { ...d, dataset: [...d.dataset, makeRow(d.dataset, 'simulation', cells)] }))}
        keys={keys.keys}
        auto={keys.auto}
        extra={server.keysReleased ? (
          <div className={styles.keyBar}>
            <p>Your teacher has released the answer key for your team’s record.</p>
            {keys.status === 'ready' ? <button type="button" className={styles.secondary} onClick={keys.clear}>Hide answer key</button>
              : <button type="button" className={styles.secondary} onClick={keys.load} disabled={keys.status === 'loading'}>{keys.status === 'loading' ? 'Loading…' : 'Show answer key'}</button>}
            {keys.message ? <p role="alert" className={styles.fieldError}>{keys.message}</p> : null}
          </div>
        ) : null}
      />
      <Feedback server={server} />
    </div>
  )
}
