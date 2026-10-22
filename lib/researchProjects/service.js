import { LIMITS, STATUS, STUDENT_EDITABLE, ATTACHED_CLASS_IDS } from './config.js'
import { hashMember } from './access.js'
import { getKey, keysFor, autoCheck } from './answerKeys.js'
import { validateDoc, validateRevision, validateScope, validateClassId, validateRubric, validateComment, ValidationError } from './schema.js'
import { PLAN_FIELDS } from './shared.js'
import {
  blankRecord, newRecord, getRecord, listRecords, insertFirst, updateWhere,
  eventPush, feedbackPush, submissionPush,
} from './store.js'

export class ServiceError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message)
    this.name = 'ServiceError'
    this.status = status
    this.code = code
    this.extra = extra
  }
}

const iso = d => (d instanceof Date ? d.toISOString() : d ?? null)

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
  }
  return JSON.stringify(value)
}

const docOf = r => ({ plan: r.plan, answers: r.answers, dataset: r.dataset, todo: r.todo })

function todoProgress(project, todo) {
  const total = project.todo.length
  const done = project.todo.filter(t => todo?.[t.id]).length
  return { done, total }
}

// What a student (or their team) may see. No keys, no other identities, no Clerk ids.
export function studentView(record) {
  return {
    exists: record.revision > 0,
    revision: record.revision,
    status: record.status,
    doc: docOf(record),
    updatedAt: iso(record.updatedAt),
    updatedBy: record.updatedBy ? { label: record.updatedBy.role === 'teacher' ? 'Teacher' : record.updatedBy.label || 'Team member' } : null,
    submittedAt: iso(record.submittedAt),
    safetyApproved: !!record.safetyReview?.approved,
    keysReleased: !!record.keyRelease?.released,
    submissionCount: record.submissions?.length || 0,
    feedback: (record.feedback || []).map(f => ({ id: f.id, at: iso(f.at), kind: f.kind, rubric: f.rubric, comment: f.comment, by: 'Teacher' })),
    events: (record.events || []).map(e => ({ at: iso(e.at), type: e.type, by: e.by?.role === 'teacher' ? 'Teacher' : e.by?.label || 'Team member', revision: e.revision })),
  }
}

export function teacherView(record, project) {
  return {
    ...studentView(record),
    classId: record.classId,
    scope: record.scope,
    reviewRevision: record.reviewRevision || 0,
    progress: todoProgress(project, record.todo),
    safetyReview: record.safetyReview ? { approved: !!record.safetyReview.approved, at: iso(record.safetyReview.at) } : null,
    keyRelease: record.keyRelease ? { released: !!record.keyRelease.released, at: iso(record.keyRelease.at) } : null,
    submissions: (record.submissions || []).map(s => ({ n: s.n, at: iso(s.at), revision: s.revision, snapshot: s.snapshot })),
  }
}

const teacherBy = (access) => ({ role: 'teacher', id: hashMember(access.userId), label: 'Teacher' })
const studentBy = (access) => ({ role: 'student', id: hashMember(access.memberId), label: access.label })

function requireViewer(access, viewer) {
  if (viewer !== access.viewer) {
    throw new ServiceError(409, 'account_changed', 'You are now signed in as someone else. Reload the page before saving, so this work is not saved to the wrong account.')
  }
}

function studentScope(access) {
  return { classId: access.classId, scope: access.scope }
}

function teacherTarget(deps, access, query) {
  const classId = validateClassId(query.classId)
  const attached = deps.attachedClassIds ?? ATTACHED_CLASS_IDS
  if (!attached.includes(classId)) throw new ServiceError(409, 'no_class_attached', 'This library is not attached to that class yet.')
  return { classId, scope: validateScope(query.scope) }
}

function requireTeacher(access) {
  if (access.role !== 'teacher') throw new ServiceError(403, 'teacher_only', 'Teacher access required.')
}

function requireStudent(access) {
  if (access.role !== 'student') throw new ServiceError(403, 'student_only', 'Teachers review work but do not edit a team’s answers.')
}

function conflict(current, project, access) {
  const view = access.role === 'teacher' ? teacherView(current, project) : studentView(current)
  return new ServiceError(409, 'conflict', 'This record changed since you opened it. Nothing was overwritten.', { current: view })
}

function locked(current, project, access) {
  const view = access.role === 'teacher' ? teacherView(current, project) : studentView(current)
  return new ServiceError(423, 'locked', 'This record is submitted or accepted, so it cannot be edited right now.', { current: view })
}

// ---------- reading ----------

export async function readRecord(deps, access, project, query = {}) {
  const col = await deps.collection()
  if (access.role === 'student') {
    const ctx = { ...studentScope(access), slug: project.slug }
    const record = (await getRecord(col, ctx)) || blankRecord(ctx)
    return { record: studentView(record) }
  }
  const ctx = { ...teacherTarget(deps, access, query), slug: project.slug }
  const record = await getRecord(col, ctx)
  if (!record) throw new ServiceError(404, 'not_found', 'No record has been saved for that team yet.')
  return { record: teacherView(record, project) }
}

export async function readClassOverview(deps, access, project, query = {}) {
  requireTeacher(access)
  const classId = validateClassId(query.classId)
  const attached = deps.attachedClassIds ?? ATTACHED_CLASS_IDS
  if (!attached.includes(classId)) throw new ServiceError(409, 'no_class_attached', 'This library is not attached to that class yet.')
  const col = await deps.collection()
  const rows = await listRecords(col, { classId, slug: project.slug })
  return {
    records: rows.map(r => ({
      scope: r.scope,
      revision: r.revision,
      status: r.status,
      updatedAt: iso(r.updatedAt),
      progress: todoProgress(project, r.todo),
      rows: (r.dataset || []).length,
      answered: Object.keys(r.answers || {}).length,
      safetyApproved: !!r.safetyReview?.approved,
      keysReleased: !!r.keyRelease?.released,
    })),
  }
}

// ---------- student saves ----------

function measuredRowsNeedReview(next, current) {
  if (current?.safetyReview?.approved) return false
  const known = new Set((current?.dataset || []).filter(r => r.source === 'measured').map(canonical))
  return next.dataset.some(r => r.source === 'measured' && !known.has(canonical(r)))
}

export async function saveRecord(deps, access, project, body) {
  requireStudent(access)
  if (!body || typeof body !== 'object') throw new ValidationError('Expected an object.')
  for (const key of Object.keys(body)) if (!['slug', 'viewer', 'baseRevision', 'doc'].includes(key)) throw new ValidationError('Unexpected field “' + key.slice(0, 40) + '”.')
  requireViewer(access, body.viewer)
  const base = validateRevision(body.baseRevision)
  const doc = validateDoc(project, body.doc)
  const now = deps.now()
  const ctx = { ...studentScope(access), slug: project.slug }
  const by = studentBy(access)
  const col = await deps.collection()
  const current = await getRecord(col, ctx)

  if (base === 0) {
    if (current) throw conflict(current, project, access)
    if (measuredRowsNeedReview(doc, null)) throw new ServiceError(422, 'safety_review_required', 'Measured data can be recorded after your teacher has recorded the safety review. Simulation rows are fine now.')
    const record = newRecord({ ...ctx, doc, by, now })
    const result = await insertFirst(col, record)
    if (!result.ok) throw conflict(await getRecord(col, ctx), project, access)
    return { record: studentView(record) }
  }

  if (!current || current.revision !== base) {
    if (!current) throw new ServiceError(409, 'conflict', 'This record no longer exists. Reload to continue.', {})
    throw conflict(current, project, access)
  }
  if (!STUDENT_EDITABLE.includes(current.status)) throw locked(current, project, access)
  if (canonical(doc) === canonical(docOf(current))) return { record: studentView(current), unchanged: true }
  if (measuredRowsNeedReview(doc, current)) throw new ServiceError(422, 'safety_review_required', 'Measured data can be recorded after your teacher has recorded the safety review. Simulation rows are fine now.')

  const ok = await updateWhere(col, ctx, { revision: base, status: { $in: STUDENT_EDITABLE } }, {
    $set: { ...doc, revision: base + 1, updatedAt: now, updatedBy: by },
  })
  const latest = await getRecord(col, ctx)
  if (!ok) {
    if (latest && !STUDENT_EDITABLE.includes(latest.status) && latest.revision === base) throw locked(latest, project, access)
    throw conflict(latest, project, access)
  }
  return { record: studentView(latest) }
}

// ---------- lifecycle actions ----------

function submissionProblems(project, record) {
  const problems = []
  const unticked = project.todo.filter(t => t.id.startsWith('sf:') && !record.todo?.[t.id])
  if (unticked.length) problems.push('Confirm every safety item (' + unticked.length + ' left).')
  for (const key of ['question', 'model', 'uncertainty', 'improvement']) {
    if ((record.plan?.[key] || '').trim().length < LIMITS.minPlanChars) problems.push('Write at least ' + LIMITS.minPlanChars + ' characters for “' + key + '” in the team plan.')
  }
  if ((record.dataset || []).length < LIMITS.minDatasetRowsToSubmit) problems.push('Record at least ' + LIMITS.minDatasetRowsToSubmit + ' data rows.')
  return problems
}

export async function applyAction(deps, access, project, body) {
  if (!body || typeof body !== 'object') throw new ValidationError('Expected an object.')
  requireViewer(access, body.viewer)
  const now = deps.now()
  const col = await deps.collection()

  if (body.action === 'submit') {
    requireStudent(access)
    for (const key of Object.keys(body)) if (!['slug', 'viewer', 'action', 'baseRevision'].includes(key)) throw new ValidationError('Unexpected field “' + key.slice(0, 40) + '”.')
    const base = validateRevision(body.baseRevision)
    const ctx = { ...studentScope(access), slug: project.slug }
    const current = await getRecord(col, ctx)
    if (!current) throw new ServiceError(409, 'not_saved', 'Save your work once before submitting.')
    if (current.revision !== base) throw conflict(current, project, access)
    if (!STUDENT_EDITABLE.includes(current.status)) throw locked(current, project, access)
    const problems = submissionProblems(project, current)
    if (problems.length) throw new ServiceError(422, 'incomplete', 'The record is not ready to submit.', { problems })
    const by = studentBy(access)
    const n = (current.submissions?.length || 0) + 1
    const ok = await updateWhere(col, ctx, { revision: base, status: { $in: STUDENT_EDITABLE } }, {
      $set: { status: STATUS.submitted, submittedAt: now, revision: base + 1, updatedAt: now, updatedBy: by },
      $push: { ...eventPush({ at: now, type: 'submitted', by, revision: base + 1 }), ...submissionPush({ n, at: now, revision: base + 1, snapshot: docOf(current) }) },
    })
    const latest = await getRecord(col, ctx)
    if (!ok) throw conflict(latest, project, access)
    return { record: studentView(latest) }
  }

  requireTeacher(access)
  const ctx = { ...teacherTarget(deps, access, body), slug: project.slug }
  const reviewBase = validateRevision(body.reviewRevision, 'reviewRevision')
  const current = await getRecord(col, ctx)
  if (!current) throw new ServiceError(404, 'not_found', 'No record has been saved for that team yet.')
  const by = teacherBy(access)
  const finish = async (conditions, update) => {
    const ok = await updateWhere(col, ctx, { reviewRevision: reviewBase, ...conditions }, update)
    const latest = await getRecord(col, ctx)
    if (!ok) throw conflict(latest, project, access)
    return { record: teacherView(latest, project) }
  }
  if (current.reviewRevision !== reviewBase) throw conflict(current, project, access)

  if (body.action === 'safety_review') {
    exactKeys(body, ['slug', 'viewer', 'action', 'classId', 'scope', 'reviewRevision', 'approved'])
    if (typeof body.approved !== 'boolean') throw new ValidationError('approved must be true or false.')
    return finish({}, {
      $set: { safetyReview: { approved: body.approved, at: now, by }, reviewRevision: reviewBase + 1 },
      $push: eventPush({ at: now, type: body.approved ? 'safety_approved' : 'safety_withdrawn', by, revision: current.revision }),
    })
  }

  if (body.action === 'release_keys') {
    exactKeys(body, ['slug', 'viewer', 'action', 'classId', 'scope', 'reviewRevision', 'released'])
    if (typeof body.released !== 'boolean') throw new ValidationError('released must be true or false.')
    if (body.released && !(current.submissions?.length > 0)) {
      throw new ServiceError(422, 'not_submitted', 'Answer keys can be released only after the team has submitted at least once.')
    }
    return finish({}, {
      $set: { keyRelease: { released: body.released, at: now, by }, reviewRevision: reviewBase + 1 },
      $push: eventPush({ at: now, type: body.released ? 'keys_released' : 'keys_withdrawn', by, revision: current.revision }),
    })
  }

  if (body.action === 'feedback') {
    exactKeys(body, ['slug', 'viewer', 'action', 'classId', 'scope', 'reviewRevision', 'baseRevision', 'outcome', 'rubric', 'comment'])
    const outcome = body.outcome
    if (!['comment', 'revision', 'accept'].includes(outcome)) throw new ValidationError('Unknown outcome.', 'outcome')
    const rubric = validateRubric(project, body.rubric ?? {})
    const comment = validateComment(body.comment).trim()
    if (!comment && !Object.keys(rubric).length) throw new ValidationError('Add a comment or at least one rubric score.')
    const entry = { id: deps.newId(), at: now, kind: outcome, rubric, comment, by }
    if (outcome === 'comment') {
      return finish({}, {
        $set: { reviewRevision: reviewBase + 1 },
        $push: { ...feedbackPush(entry), ...eventPush({ at: now, type: 'feedback', by, revision: current.revision }) },
      })
    }
    const docBase = validateRevision(body.baseRevision)
    if (current.status !== STATUS.submitted) throw new ServiceError(409, 'not_submitted', 'Only a submitted record can be returned or accepted.', { current: teacherView(current, project) })
    if (current.revision !== docBase) throw conflict(current, project, access)
    if (outcome === 'revision' && !comment) throw new ValidationError('Explain what needs revising.', 'comment')
    const status = outcome === 'revision' ? STATUS.revision : STATUS.accepted
    return finish({ revision: docBase, status: STATUS.submitted }, {
      $set: { status, revision: docBase + 1, reviewRevision: reviewBase + 1, updatedAt: now, updatedBy: by },
      $push: { ...feedbackPush(entry), ...eventPush({ at: now, type: outcome === 'revision' ? 'revision_requested' : 'accepted', by, revision: docBase + 1 }) },
    })
  }

  throw new ValidationError('Unknown action.', 'action')
}

function exactKeys(body, allowed) {
  for (const key of Object.keys(body)) if (!allowed.includes(key)) throw new ValidationError('Unexpected field “' + key.slice(0, 40) + '”.')
}

// ---------- answer keys ----------

// Keys never travel with project content. They are delivered here, only when policy allows:
// teachers always; students only after their teacher has released keys for their own record.
export async function readKeys(deps, access, project, query = {}) {
  const col = await deps.collection()
  let record = null
  if (access.role === 'student') {
    record = await getRecord(col, { ...studentScope(access), slug: project.slug })
    if (!record?.keyRelease?.released) throw new ServiceError(403, 'keys_not_released', 'Your teacher has not released the answer key for your record.')
  } else if (query.scope || query.classId) {
    record = await getRecord(col, { ...teacherTarget(deps, access, query), slug: project.slug })
  }
  const keys = keysFor(project.slug)
  const auto = {}
  if (record) {
    for (const q of project.questions) {
      const result = autoCheck(q, record.answers?.[q.id], getKey(project.slug, q.id))
      if (result !== undefined) auto[q.id] = result
    }
  }
  return { keys, auto }
}

export const _internals = { submissionProblems, PLAN_FIELDS }
