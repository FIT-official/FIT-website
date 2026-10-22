// @vitest-environment node
// Lifecycle, teacher boundary and answer-key policy. SYNTHETIC accounts and an in-memory collection.
import { describe, it, expect } from 'vitest'
import { handleRecordsGet, handleRecordsPut, handleActionsPost, handleKeysGet } from '@/lib/researchProjects/http'
import { getProject } from '@/lib/researchProjects/content'
import { ANSWER_KEYS } from '@/lib/researchProjects/answerKeys'
import { createWorld, WORLD_MEMBERS, request, read, fullDoc, SLUG } from './helpers'

const project = getProject(SLUG)
const RECORDS = '/api/research-projects/records'
const call = async (handler, deps, method, path, opts) => read(await handler(request(method, path, opts), deps))
const getRecord = (deps, extra = '') => call(handleRecordsGet, deps, 'GET', `${RECORDS}?slug=${SLUG}${extra}`)
const put = (deps, body) => call(handleRecordsPut, deps, 'PUT', RECORDS, { body })
const act = (deps, body) => call(handleActionsPost, deps, 'POST', '/api/research-projects/actions', { body: { slug: SLUG, ...body } })
const keys = (deps, extra = '') => call(handleKeysGet, deps, 'GET', `/api/research-projects/keys?slug=${SLUG}${extra}`)

function world(options = {}) {
  const w = createWorld({ members: WORLD_MEMBERS, ...options })
  const as = userId => { w.session.userId = userId }
  const student = async (userId = 'stu-a1') => {
    as(userId)
    const open = await getRecord(w.deps)
    return open.body
  }
  const saveAs = async (userId, doc) => {
    const open = await student(userId)
    return put(w.deps, { slug: SLUG, viewer: open.viewer, baseRevision: open.record.revision, doc })
  }
  const submitAs = async userId => {
    const open = await student(userId)
    return act(w.deps, { viewer: open.viewer, action: 'submit', baseRevision: open.record.revision })
  }
  // Teacher view of one team record.
  const teacher = async (scope = 'group:g1', classId = 'class-a') => {
    as('teacher-1')
    const r = await getRecord(w.deps, `&classId=${classId}&scope=${scope}`)
    return r
  }
  const teacherAct = async (body, scope = 'group:g1', classId = 'class-a') => {
    const t = await teacher(scope, classId)
    // Only revision/accept decisions are tied to the document revision the teacher actually read.
    const docRevision = body.action === 'feedback' ? { baseRevision: t.body.record.revision } : {}
    return act(w.deps, { viewer: t.body.viewer, classId, scope, reviewRevision: t.body.record.reviewRevision, ...docRevision, ...body })
  }
  return { ...w, as, student, saveAs, submitAs, teacher, teacherAct }
}

const measuredRow = id => ({ id, source: 'measured', note: 'bench', cells: { distanceMm: { v: 12, u: 0.5 } } })

describe('safety review gates measured data', () => {
  it('allows simulation rows now, and measured rows only after the teacher records a safety review', async () => {
    const w = world()
    const base = fullDoc(project)
    expect((await w.saveAs('stu-a1', base)).status).toBe(200)
    const withMeasured = { ...base, dataset: [...base.dataset, measuredRow('m1')] }
    const denied = await w.saveAs('stu-a1', withMeasured)
    expect(denied.status).toBe(422)
    expect(denied.body.code).toBe('safety_review_required')
    expect((await w.student()).record.doc.dataset).toHaveLength(3)

    const approved = await w.teacherAct({ action: 'safety_review', approved: true })
    expect(approved.status).toBe(200)
    expect(approved.body.record.safetyReview.approved).toBe(true)
    expect((await w.saveAs('stu-a1', withMeasured)).status).toBe(200)
    expect((await w.student()).record.safetyApproved).toBe(true)

    // Withdrawing approval does not delete data, but new or changed measured rows are blocked again.
    await w.teacherAct({ action: 'safety_review', approved: false })
    const changed = { ...withMeasured, dataset: withMeasured.dataset.map(r => (r.id === 'm1' ? { ...r, note: 'edited' } : r)) }
    expect((await w.saveAs('stu-a1', changed)).status).toBe(422)
    const harmless = { ...withMeasured, plan: { ...withMeasured.plan, model: 'An unrelated edit to the model text' } }
    expect((await w.saveAs('stu-a1', harmless)).status).toBe(200)
  })

  it('refuses measured rows on a first save', async () => {
    const w = world()
    const doc = fullDoc(project, { dataset: [measuredRow('m1')] })
    expect((await w.saveAs('stu-a1', doc)).status).toBe(422)
    expect(w.collection.docs.size).toBe(0)
  })
})

describe('review, submit and revise', () => {
  it('requires a saved, complete record before submitting and reports exactly what is missing', async () => {
    const w = world()
    expect((await w.submitAs('stu-a1')).body.code).toBe('not_saved')
    await w.saveAs('stu-a1', { plan: { question: 'short', model: '', dataPlan: '', uncertainty: '', improvement: '' }, answers: {}, dataset: [], todo: {} })
    const r = await w.submitAs('stu-a1')
    expect(r.status).toBe(422)
    expect(r.body.code).toBe('incomplete')
    const text = r.body.problems.join(' ')
    expect(text).toMatch(/safety item/)
    expect(text).toMatch(/question/)
    expect(text).toMatch(/model/)
    expect(text).toMatch(/uncertainty/)
    expect(text).toMatch(/improvement/)
    expect(text).toMatch(/data rows/)
    expect((await w.student()).record.status).toBe('draft')
  })

  it('walks draft -> submitted -> revision requested -> resubmitted -> accepted with history', async () => {
    const w = world()
    await w.saveAs('stu-a1', fullDoc(project))
    const submitted = await w.submitAs('stu-a1')
    expect(submitted.status).toBe(200)
    expect(submitted.body.record).toMatchObject({ status: 'submitted', submissionCount: 1 })

    // Locked while submitted: a teammate's save is refused and nothing changes.
    const locked = await w.saveAs('stu-a2', fullDoc(project, { plan: { question: 'Edit while locked, long enough', model: '', dataPlan: '', uncertainty: '', improvement: '' } }))
    expect(locked.status).toBe(423)
    expect(locked.body.code).toBe('locked')
    expect([...w.collection.docs.values()][0].plan.question).toBe('A clear, bounded statement for the plan.')
    expect((await w.submitAs('stu-a1')).status).toBe(423)

    // Teacher returns it with a rubric and a comment.
    const returned = await w.teacherAct({ action: 'feedback', outcome: 'revision', rubric: { question: 2, uncertainty: 1 }, comment: 'Quantify the uncertainty in z.' })
    expect(returned.status).toBe(200)
    expect(returned.body.record.status).toBe('revision_requested')
    expect(returned.body.record.feedback).toHaveLength(1)

    // Student (any team member) sees feedback, cannot see teacher identity, and can revise.
    const open = await w.student('stu-a2')
    expect(open.record.status).toBe('revision_requested')
    expect(open.record.feedback[0]).toMatchObject({ kind: 'revision', rubric: { question: 2, uncertainty: 1 }, comment: 'Quantify the uncertainty in z.', by: 'Teacher' })
    expect(JSON.stringify(open)).not.toContain('teacher-1')
    const revised = await put(w.deps, { slug: SLUG, viewer: open.viewer, baseRevision: open.record.revision, doc: fullDoc(project, { plan: { question: 'Revised question with uncertainty in z', model: 'x'.repeat(30), dataPlan: '', uncertainty: 'Reading uncertainty plus repeat scatter', improvement: 'y'.repeat(30) } }) })
    expect(revised.status).toBe(200)
    const again = await w.submitAs('stu-a2')
    expect(again.body.record).toMatchObject({ status: 'submitted', submissionCount: 2 })

    const accepted = await w.teacherAct({ action: 'feedback', outcome: 'accept', rubric: { question: 3 }, comment: 'Good revision.' })
    expect(accepted.body.record.status).toBe('accepted')
    expect((await w.saveAs('stu-a1', fullDoc(project))).status).toBe(423)

    const view = (await w.teacher()).body.record
    expect(view.submissions.map(s => s.n)).toEqual([1, 2])
    expect(view.submissions[0].snapshot.plan.question).toBe('A clear, bounded statement for the plan.')
    expect(view.submissions[1].snapshot.plan.question).toBe('Revised question with uncertainty in z')
    expect(view.events.map(e => e.type)).toEqual(['created', 'submitted', 'revision_requested', 'submitted', 'accepted'])
    expect(view.feedback.map(f => f.kind)).toEqual(['revision', 'accept'])
  })

  it('allows a comment at any time without changing status, and refuses empty or unexplained feedback', async () => {
    const w = world()
    await w.saveAs('stu-a1', fullDoc(project))
    const c = await w.teacherAct({ action: 'feedback', outcome: 'comment', comment: 'Nice start.' })
    expect(c.body.record.status).toBe('draft')
    expect((await w.saveAs('stu-a1', fullDoc(project, { plan: { question: 'Edit after a comment is fine', model: '', dataPlan: '', uncertainty: '', improvement: '' } }))).status).toBe(200)
    expect((await w.teacherAct({ action: 'feedback', outcome: 'comment', comment: '   ' })).status).toBe(400)
    expect((await w.teacherAct({ action: 'feedback', outcome: 'revision', comment: 'Please fix' })).body.code).toBe('not_submitted')
    expect((await w.teacherAct({ action: 'feedback', outcome: 'accept', comment: 'ok' })).body.code).toBe('not_submitted')
    expect((await w.teacherAct({ action: 'feedback', outcome: 'comment', comment: 'x'.repeat(2001) })).status).toBe(400)
    expect((await w.teacherAct({ action: 'feedback', outcome: 'comment', rubric: { question: 9 }, comment: 'a' })).status).toBe(400)
    expect((await w.teacherAct({ action: 'feedback', outcome: 'comment', rubric: { nope: 2 }, comment: 'a' })).status).toBe(400)
    expect((await w.teacherAct({ action: 'feedback', outcome: 'comment', rubric: { question: 2 }, comment: '' })).status).toBe(200)
  })

  it('requires a reason when returning work for revision', async () => {
    const w = world()
    await w.saveAs('stu-a1', fullDoc(project))
    await w.submitAs('stu-a1')
    const r = await w.teacherAct({ action: 'feedback', outcome: 'revision', rubric: { question: 2 }, comment: '' })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/Explain what needs revising/)
  })

  it('does not let a student perform teacher actions or a teacher perform student actions', async () => {
    const w = world()
    await w.saveAs('stu-a1', fullDoc(project))
    const open = await w.student()
    for (const body of [
      { action: 'feedback', outcome: 'accept', comment: 'self-approve', classId: 'class-a', scope: 'group:g1', reviewRevision: 0, baseRevision: 1 },
      { action: 'safety_review', approved: true, classId: 'class-a', scope: 'group:g1', reviewRevision: 0 },
      { action: 'release_keys', released: true, classId: 'class-a', scope: 'group:g1', reviewRevision: 0 },
    ]) {
      const r = await act(w.deps, { viewer: open.viewer, ...body })
      expect(r.status).toBe(403)
      expect(r.body.code).toBe('teacher_only')
    }
    const t = await w.teacher()
    const asTeacher = await act(w.deps, { viewer: t.body.viewer, action: 'submit', baseRevision: 1 })
    expect(asTeacher.status).toBe(403)
    expect(asTeacher.body.code).toBe('student_only')
    expect([...w.collection.docs.values()][0]).toMatchObject({ status: 'draft', safetyReview: null, keyRelease: null })
  })
})

describe('teacher boundary', () => {
  it('lets a teacher read any team record in an attached class but not edit it', async () => {
    const w = world()
    await w.saveAs('stu-a1', fullDoc(project))
    const t = await w.teacher('group:g1')
    expect(t.status).toBe(200)
    expect(t.body.role).toBe('teacher')
    expect(t.body.record).toMatchObject({ classId: 'class-a', scope: 'group:g1', revision: 1, progress: { done: 5 } })
    const edit = await put(w.deps, { slug: SLUG, viewer: t.body.viewer, baseRevision: 1, doc: fullDoc(project) })
    expect(edit.status).toBe(403)
    expect((await w.teacher('group:g2')).status).toBe(404)
  })

  it('refuses classes that are not attached, bad scopes and bad class ids', async () => {
    const w = world()
    await w.saveAs('stu-a1', fullDoc(project))
    w.as('teacher-1')
    expect((await getRecord(w.deps, '&classId=class-b&scope=group:g1')).body.code).toBe('no_class_attached')
    expect((await getRecord(w.deps, '&classId=class-a&scope=../etc')).status).toBe(400)
    expect((await getRecord(w.deps, '&classId=%24ne&scope=group:g1')).status).toBe(400)
    expect((await getRecord(w.deps, '&classId=class-a')).body.records).toBeDefined()
  })

  it('has no class to review when nothing is attached', async () => {
    const w = world({ attached: [] })
    w.as('teacher-1')
    expect((await getRecord(w.deps, '&classId=class-a&scope=group:g1')).body.code).toBe('no_class_attached')
    expect((await getRecord(w.deps, '&classId=class-a')).body.code).toBe('no_class_attached')
  })

  it('lists a class overview with progress and status for every team', async () => {
    const w = world()
    await w.saveAs('stu-a1', fullDoc(project))
    await w.saveAs('stu-a3', fullDoc(project, { todo: {} }))
    await w.submitAs('stu-a1')
    w.as('teacher-1')
    const r = await getRecord(w.deps, '&classId=class-a')
    expect(r.status).toBe(200)
    const byScope = Object.fromEntries(r.body.records.map(x => [x.scope, x]))
    expect(Object.keys(byScope).sort()).toEqual(['group:g1', 'group:g2'])
    expect(byScope['group:g1']).toMatchObject({ status: 'submitted', rows: 3 })
    expect(byScope['group:g2']).toMatchObject({ status: 'draft', progress: { done: 0 } })
    expect(JSON.stringify(r.body)).not.toMatch(/"submissions"|"plan"/)
  })

  it('detects a second teacher acting on stale review data', async () => {
    const w = world()
    await w.saveAs('stu-a1', fullDoc(project))
    const t1 = await w.teacher()
    const first = await act(w.deps, { viewer: t1.body.viewer, action: 'safety_review', approved: true, classId: 'class-a', scope: 'group:g1', reviewRevision: t1.body.record.reviewRevision })
    expect(first.status).toBe(200)
    const stale = await act(w.deps, { viewer: t1.body.viewer, action: 'safety_review', approved: false, classId: 'class-a', scope: 'group:g1', reviewRevision: t1.body.record.reviewRevision })
    expect(stale.status).toBe(409)
    expect(stale.body.current.safetyReview.approved).toBe(true)
  })

  it('does not stop a student save when the teacher adds a comment', async () => {
    const w = world()
    await w.saveAs('stu-a1', fullDoc(project))
    const open = await w.student()
    await w.teacherAct({ action: 'feedback', outcome: 'comment', comment: 'FYI' })
    w.as('stu-a1')
    const edit = await put(w.deps, { slug: SLUG, viewer: open.viewer, baseRevision: open.record.revision, doc: fullDoc(project, { plan: { question: 'Edit after a teacher comment', model: '', dataPlan: '', uncertainty: '', improvement: '' } }) })
    expect(edit.status).toBe(200)
  })
})

describe('controlled answer-key release', () => {
  const allKeyText = () => Object.values(ANSWER_KEYS[SLUG]).flatMap(k => [k.why, k.working, ...(k.points || [])]).filter(Boolean)

  it('gives teachers the keys, and auto-checks a team’s numeric and multiple-choice answers on request', async () => {
    const w = world()
    await w.saveAs('stu-a1', fullDoc(project, { answers: { q1: { choice: 'c' }, q2: { choice: 'a' }, q4: { value: '0.2835' }, q5: { value: '99' } } }))
    w.as('teacher-1')
    const plain = await keys(w.deps)
    expect(plain.status).toBe(200)
    expect(Object.keys(plain.body.keys).sort()).toEqual(project.questions.map(q => q.id).sort())
    expect(plain.body.auto).toEqual({})
    const checked = await keys(w.deps, '&classId=class-a&scope=group:g1')
    expect(checked.body.auto).toEqual({ q1: true, q2: false, q4: true, q5: false })
  })

  it('withholds keys from students until the teacher releases them after a submission', async () => {
    const w = world()
    await w.saveAs('stu-a1', fullDoc(project, { answers: { q1: { choice: 'c' }, q4: { value: '0.283' } } }))
    w.as('stu-a1')
    expect((await keys(w.deps)).status).toBe(403)

    // Not allowed before the team has submitted at least once.
    const early = await w.teacherAct({ action: 'release_keys', released: true })
    expect(early.status).toBe(422)
    expect(early.body.code).toBe('not_submitted')
    w.as('stu-a1')
    expect((await keys(w.deps)).status).toBe(403)

    await w.submitAs('stu-a1')
    const released = await w.teacherAct({ action: 'release_keys', released: true })
    expect(released.status).toBe(200)
    expect(released.body.record.keyRelease.released).toBe(true)

    // Own team gets keys and auto-checks; another team's record is unaffected.
    w.as('stu-a2')
    const mate = await keys(w.deps)
    expect(mate.status).toBe(200)
    expect(mate.body.auto).toEqual({ q1: true, q4: true })
    expect(mate.body.keys.q1).toMatchObject({ type: 'mcq', correct: 'c' })
    w.as('stu-a3')
    expect((await keys(w.deps)).status).toBe(403)
    w.as('stu-solo')
    expect((await keys(w.deps)).status).toBe(403)

    // Withdrawing release closes the door for later requests.
    await w.teacherAct({ action: 'release_keys', released: false })
    w.as('stu-a1')
    expect((await keys(w.deps)).status).toBe(403)
  })

  it('never includes key text in ordinary record responses even after release', async () => {
    const w = world()
    await w.saveAs('stu-a1', fullDoc(project))
    await w.submitAs('stu-a1')
    await w.teacherAct({ action: 'release_keys', released: true })
    const open = await w.student()
    const text = JSON.stringify(open)
    for (const piece of allKeyText()) expect(text).not.toContain(piece)
    expect(open.record.keysReleased).toBe(true)
    const t = JSON.stringify((await w.teacher()).body)
    for (const piece of allKeyText()) expect(t).not.toContain(piece)
  })

  it('ignores any attempt by a student to name another team’s record when asking for keys', async () => {
    const w = world()
    await w.saveAs('stu-a1', fullDoc(project))
    await w.submitAs('stu-a1')
    await w.teacherAct({ action: 'release_keys', released: true })
    w.as('stu-a3')
    expect((await keys(w.deps, '&classId=class-a&scope=group:g1')).status).toBe(403)
  })
})
