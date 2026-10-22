'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { requestJson, recordsUrl, ACTIONS_ENDPOINT, useRequestGuard, isAbort, NetworkError } from './api'
import { useKeys } from './useProjectRecord'
import ProjectBody from './ProjectBody'
import { emptyDocument, STATUS_LABELS, assetUrl } from '@/lib/researchProjects/shared'
import styles from './ResearchProjects.module.css'

const formatTime = iso => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '')
const scopeLabel = scope => (scope.startsWith('group:') ? 'Group ' + scope.slice(6) : 'Individual ' + scope.slice(7))

function FeedbackForm({ project, record, busy, onSend }) {
  const [outcome, setOutcome] = useState('comment')
  const [scores, setScores] = useState({})
  const [comment, setComment] = useState('')
  const canDecide = record.status === 'submitted'
  return (
    <form className={styles.feedbackForm} onSubmit={e => {
      e.preventDefault()
      const rubric = Object.fromEntries(Object.entries(scores).filter(([, v]) => v).map(([k, v]) => [k, Number(v)]))
      onSend({ outcome, rubric, comment }).then(ok => { if (ok) { setScores({}); setComment(''); setOutcome('comment') } })
    }}>
      <h4>Give feedback</h4>
      <fieldset>
        <legend>Outcome</legend>
        <label><input type="radio" name="outcome" checked={outcome === 'comment'} onChange={() => setOutcome('comment')} /> Comment only (record stays as it is)</label>
        <label><input type="radio" name="outcome" disabled={!canDecide} checked={outcome === 'revision'} onChange={() => setOutcome('revision')} /> Return for revision {canDecide ? '' : '(needs a submitted record)'}</label>
        <label><input type="radio" name="outcome" disabled={!canDecide} checked={outcome === 'accept'} onChange={() => setOutcome('accept')} /> Accept (locks the record)</label>
      </fieldset>
      <div className={styles.rubricGrid}>
        {project.rubric.map(c => (
          <label key={c.id}>{c.label}
            <select value={scores[c.id] || ''} onChange={e => setScores(s => ({ ...s, [c.id]: e.target.value }))}>
              <option value="">Not scored</option>
              {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}: {c.levels[n - 1].slice(0, 70)}{c.levels[n - 1].length > 70 ? '…' : ''}</option>)}
            </select>
          </label>
        ))}
      </div>
      <label className={styles.block}>Comment for the team
        <textarea rows={4} value={comment} maxLength={2000} onChange={e => setComment(e.target.value)} />
      </label>
      <button type="submit" className={styles.primary} disabled={busy}>{busy ? 'Sending…' : 'Send feedback'}</button>
    </form>
  )
}

export default function TeacherPanel({ project, viewer, classIds, onSelect }) {
  const guard = useRequestGuard()
  const [classId, setClassId] = useState(classIds[0] || '')
  const [overview, setOverview] = useState({ status: 'idle', records: [], message: '' })
  const [scope, setScope] = useState('')
  const [record, setRecord] = useState(null)
  const [state, setState] = useState({ status: 'idle', message: '' })
  const [busy, setBusy] = useState(false)


  const loadOverview = useCallback(async () => {
    if (!classId) return
    const g = guard()
    setOverview(o => ({ ...o, status: 'loading', message: '' }))
    try {
      const r = await requestJson('GET', recordsUrl(project.slug, `&classId=${encodeURIComponent(classId)}`), { signal: g.signal })
      if (!g.current()) return
      if (r.ok && r.data.viewer === viewer) setOverview({ status: 'ready', records: r.data.records, message: '' })
      else setOverview({ status: 'error', records: [], message: r.data?.error || 'Could not load the class.' })
    } catch (error) {
      if (isAbort(error) || !g.current()) return
      setOverview({ status: 'error', records: [], message: error instanceof NetworkError ? 'You appear to be offline.' : 'Could not load the class.' })
    }
  }, [classId, project.slug, viewer, guard])

  useEffect(() => { loadOverview() }, [loadOverview])

  const open = useCallback(async nextScope => {
    const g = guard()
    setScope(nextScope)
    setRecord(null)
    onSelect(null)
    setState({ status: 'loading', message: '' })
    try {
      const r = await requestJson('GET', recordsUrl(project.slug, `&classId=${encodeURIComponent(classId)}&scope=${encodeURIComponent(nextScope)}`), { signal: g.signal })
      if (!g.current()) return
      if (r.ok && r.data.viewer === viewer) { setRecord(r.data.record); onSelect(r.data.record); setState({ status: 'ready', message: '' }) }
      else setState({ status: 'error', message: r.data?.error || 'Could not open that record.' })
    } catch (error) {
      if (isAbort(error) || !g.current()) return
      setState({ status: 'error', message: 'Could not open that record. Check your connection and try again.' })
    }
  }, [classId, project.slug, viewer, guard, onSelect])

  const act = useCallback(async body => {
    if (!record) return false
    setBusy(true)
    setState({ status: 'ready', message: '' })
    try {
      const r = await requestJson('POST', ACTIONS_ENDPOINT, {
        body: { slug: project.slug, viewer, classId, scope, reviewRevision: record.reviewRevision, ...(body.action === 'feedback' ? { baseRevision: record.revision } : {}), ...body },
      })
      if (r.ok && r.data.viewer === viewer) {
        setRecord(r.data.record)
        onSelect(r.data.record)
        setState({ status: 'ready', message: 'Saved.' })
        loadOverview()
        return true
      }
      if (r.status === 409 && r.data?.current) {
        setRecord(r.data.current)
        onSelect(r.data.current)
        setState({ status: 'error', message: 'This record changed while you were reviewing. It has been reloaded; check it and try again.' })
      } else setState({ status: 'error', message: r.data?.error || 'That action could not be completed.' })
      return false
    } catch (error) {
      setState({ status: 'error', message: error instanceof NetworkError ? 'Offline: nothing was changed.' : 'That action could not be completed.' })
      return false
    } finally {
      setBusy(false)
    }
  }, [record, project.slug, viewer, classId, scope, onSelect, loadOverview])

  const sorted = useMemo(() => [...overview.records].sort((a, b) => a.scope.localeCompare(b.scope)), [overview.records])

  if (!classIds.length) {
    return (
      <section className={styles.teacherPanel} aria-labelledby="teacher-h">
        <h2 id="teacher-h">Teacher view</h2>
        <div className={styles.notice} role="status">
          <p><strong>No class is attached to this library yet, so student access is switched off.</strong> Students are admitted only through a reviewed class membership mapping, and none has been supplied. You can still read everything below, including the answer key.</p>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.teacherPanel} aria-labelledby="teacher-h">
      <h2 id="teacher-h">Teacher review</h2>
      <label>Class{' '}
        <select value={classId} onChange={e => { setClassId(e.target.value); setScope(''); setRecord(null); onSelect(null) }}>
          {classIds.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      {overview.status === 'loading' ? <p role="status">Loading teams…</p> : null}
      {overview.status === 'error' ? <p role="alert" className={styles.fieldError}>{overview.message} <button type="button" className={styles.secondary} onClick={loadOverview}>Retry</button></p> : null}
      {overview.status === 'ready' && sorted.length === 0 ? <p className={styles.empty}>No team has saved a record for this project yet.</p> : null}
      {sorted.length ? (
        <div className={styles.scroll} role="region" aria-label="Teams" tabIndex={0}>
          <table className={styles.table}>
            <thead><tr><th scope="col">Team</th><th scope="col">Status</th><th scope="col">To-do</th><th scope="col">Rows</th><th scope="col">Answered</th><th scope="col">Safety review</th><th scope="col">Key</th><th scope="col">Updated</th><th scope="col"><span className={styles.srOnly}>Open</span></th></tr></thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.scope} aria-selected={r.scope === scope}>
                  <th scope="row">{scopeLabel(r.scope)}</th>
                  <td>{STATUS_LABELS[r.status]}</td>
                  <td>{r.progress.done}/{r.progress.total}</td>
                  <td>{r.rows}</td>
                  <td>{r.answered}</td>
                  <td>{r.safetyApproved ? 'Approved' : 'Pending'}</td>
                  <td>{r.keysReleased ? 'Released' : 'Held'}</td>
                  <td>{formatTime(r.updatedAt)}</td>
                  <td><button type="button" className={styles.secondary} onClick={() => open(r.scope)}>Open {scopeLabel(r.scope)}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {state.status === 'loading' ? <p role="status">Opening record…</p> : null}
      {state.message ? <p role={state.status === 'error' ? 'alert' : 'status'} className={state.status === 'error' ? styles.fieldError : styles.note}>{state.message}</p> : null}

      {record ? (
        <div className={styles.review}>
          <h3>{scopeLabel(record.scope)} · {STATUS_LABELS[record.status]} · revision {record.revision}</h3>
          <p className={styles.note}>The record below is read-only for you. Teams edit it; you give feedback, record the safety review and control the answer key.</p>
          <div className={styles.buttonRow}>
            <button type="button" className={styles.secondary} disabled={busy}
              onClick={() => act({ action: 'safety_review', approved: !record.safetyReview?.approved })}>
              {record.safetyReview?.approved ? 'Withdraw safety review' : 'Record safety review: approved'}
            </button>
            <button type="button" className={styles.secondary} disabled={busy || (!record.keyRelease?.released && record.submissionCount === 0)}
              onClick={() => act({ action: 'release_keys', released: !record.keyRelease?.released })}>
              {record.keyRelease?.released ? 'Withdraw answer key from this team' : 'Release answer key to this team'}
            </button>
          </div>
          <p className={styles.note}>
            Safety review: {record.safetyReview?.approved ? 'approved, so measured rows can be recorded' : 'not approved, so only simulation rows can be recorded'}.
            Answer key: {record.keyRelease?.released ? 'released to this team' : record.submissionCount === 0 ? 'held; it can be released after the first submission' : 'held'}.
            Submissions: {record.submissionCount}.
          </p>
          <FeedbackForm key={record.reviewRevision + ':' + record.revision} project={project} record={record} busy={busy} onSend={body => act({ action: 'feedback', ...body })} />
          <h4>Earlier feedback</h4>
          {record.feedback.length === 0 ? <p className={styles.empty}>None yet.</p> : (
            <ol className={styles.feedback}>
              {[...record.feedback].reverse().map(f => (
                <li key={f.id}><p>{formatTime(f.at)} · {f.kind}{Object.keys(f.rubric || {}).length ? ' · ' + Object.entries(f.rubric).map(([k, v]) => `${k} ${v}/4`).join(', ') : ''}</p>{f.comment ? <p>{f.comment}</p> : null}</li>
              ))}
            </ol>
          )}
          <h4>Submission history</h4>
          <ul className={styles.history}>
            {record.submissions.map(s => <li key={s.n}>Submission {s.n} · {formatTime(s.at)} · revision {s.revision}</li>)}
            {record.events.map((e, i) => <li key={'e' + i}>{formatTime(e.at)} · {e.type.replaceAll('_', ' ')} · {e.by}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

// Teacher wrapper: review panel above the read-only content for the selected team (or a blank preview).
export function TeacherWorkspace({ project, viewer, classIds }) {
  const [record, setRecord] = useState(null)
  const [selectedKey, setSelectedKey] = useState({ query: '' })
  const keys = useKeys(project.slug, selectedKey.query)
  const doc = record ? record.doc : emptyDocument()
  const onSelect = useCallback(r => { setRecord(r); setSelectedKey({ query: r ? `&classId=${encodeURIComponent(r.classId)}&scope=${encodeURIComponent(r.scope)}` : '' }) }, [])
  return (
    <div>
      <TeacherPanel project={project} viewer={viewer} classIds={classIds} onSelect={onSelect} />
      <ProjectBody
        project={project}
        doc={doc}
        editable={false}
        canMeasure={false}
        simDisabledReason="Teachers preview the simulation. Teams record results in their own data table."
        onToggle={() => {}} onPlan={() => {}} onAnswer={() => {}} onDataset={() => {}} onAddSimRow={() => {}}
        keys={keys.keys}
        auto={keys.auto}
        extra={(
          <div className={styles.keyBar}>
            <p>{record ? 'Showing the selected team’s record, read-only.' : 'Preview mode: no team selected.'} Show the answer key here to mark against it.</p>
            {keys.status === 'ready' ? <button type="button" className={styles.secondary} onClick={keys.clear}>Hide answer key in questions</button>
              : <button type="button" className={styles.secondary} onClick={keys.load} disabled={keys.status === 'loading'}>Show answer key in questions</button>}
            {keys.message ? <p role="alert" className={styles.fieldError}>{keys.message}</p> : null}
            {keys.teacher && (keys.teacher.notes.length || keys.teacher.assets.length) ? (
              <div className={styles.teacherOnly}>
                <h3>Teacher-only notes and files</h3>
                <p className={styles.note}>These reveal answers. Do not show them to students before they commit to their own work.</p>
                <ul>{keys.teacher.notes.map(n => <li key={n}>{n}</li>)}</ul>
                <ul>{keys.teacher.assets.map(a => <li key={a.id}><a href={assetUrl(a.id)} download={a.filename}>{a.label}</a></li>)}</ul>
              </div>
            ) : null}
          </div>
        )}
      />
    </div>
  )
}
