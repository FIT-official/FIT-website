// @vitest-environment node
// API-level tests with SYNTHETIC accounts, classes and groups and an in-memory collection.
// They exercise the real handlers, schema, service and store code; membership is injected, so
// nothing here shows that a real class has been connected.
import { describe, it, expect, vi } from 'vitest'
import { handleRecordsGet, handleRecordsPut, handleActionsPost, handleKeysGet } from '@/lib/researchProjects/http'
import { researchCollectionName } from '@/lib/researchProjects/store'
import { getProject } from '@/lib/researchProjects/content'
import { ANSWER_KEYS } from '@/lib/researchProjects/answerKeys'
import { LIMITS } from '@/lib/researchProjects/config'
import { createWorld, WORLD_MEMBERS, request, read, fullDoc, SLUG, ORIGIN } from './helpers'

// `server-only` throws outside a server bundle. This narrow mock lets server modules load under test.
vi.mock('server-only', () => ({}))

const project = getProject(SLUG)
const RECORDS = '/api/research-projects/records'
const call = async (handler, deps, method, path, opts) => read(await handler(request(method, path, opts), deps))
const getRecord = (deps, slug = SLUG, extra = '') => call(handleRecordsGet, deps, 'GET', `${RECORDS}?slug=${slug}${extra}`)
const put = (deps, body, opts = {}) => call(handleRecordsPut, deps, 'PUT', RECORDS, { body, ...opts })
const act = (deps, body, opts = {}) => call(handleActionsPost, deps, 'POST', '/api/research-projects/actions', { body, ...opts })
const keys = (deps, extra = '') => call(handleKeysGet, deps, 'GET', `/api/research-projects/keys?slug=${SLUG}${extra}`)

function world(options = {}) {
  const w = createWorld({ members: WORLD_MEMBERS, ...options })
  const as = userId => { w.session.userId = userId }
  return { ...w, as }
}

// Sign in as a student, open the record and save a doc against the current revision.
async function save(w, userId, doc, base) {
  w.as(userId)
  const current = await getRecord(w.deps)
  return put(w.deps, { slug: SLUG, viewer: current.body.viewer, baseRevision: base ?? current.body.record.revision, doc })
}

describe('unauthenticated and direct API access', () => {
  it.each([
    ['GET records', w => getRecord(w.deps)],
    ['PUT records', w => put(w.deps, { slug: SLUG, viewer: 'x', baseRevision: 0, doc: {} })],
    ['POST actions', w => act(w.deps, { slug: SLUG, viewer: 'x', action: 'submit', baseRevision: 1 })],
    ['GET keys', w => keys(w.deps)],
  ])('%s returns 401 with no content and private, no-store, noindex headers', async (_name, run) => {
    const w = world()
    const { status, body, headers } = await run(w)
    expect(status).toBe(401)
    expect(body).toMatchObject({ code: 'unauthenticated' })
    expect(Object.keys(body).sort()).toEqual(['code', 'error'])
    expect(headers.get('cache-control')).toMatch(/no-store/)
    expect(headers.get('cache-control')).toMatch(/private/)
    expect(headers.get('x-robots-tag')).toMatch(/noindex/)
    expect(headers.get('vary')).toMatch(/Cookie/)
    expect(JSON.stringify(body)).not.toMatch(/holobox|question|answer/i)
    expect(w.collection.docs.size).toBe(0)
  })

  it('does not reveal whether a project slug exists before authentication', async () => {
    const w = world()
    const real = await getRecord(w.deps, SLUG)
    const fake = await getRecord(w.deps, 'no-such-project')
    expect(real.status).toBe(401)
    expect(fake.status).toBe(401)
    expect(fake.body).toEqual(real.body)
  })

  it('returns 404 for an unknown slug only after authorisation', async () => {
    const w = world()
    w.as('stu-a1')
    expect((await getRecord(w.deps, 'no-such-project')).status).toBe(404)
    expect((await getRecord(w.deps, '__proto__')).status).toBe(404)
  })
})

describe('signed-in but not a member', () => {
  it.each([
    ['GET records', w => getRecord(w.deps)],
    ['PUT records', w => put(w.deps, { slug: SLUG, viewer: 'x', baseRevision: 0, doc: fullDoc(project) })],
    ['POST actions', w => act(w.deps, { slug: SLUG, viewer: 'x', action: 'submit', baseRevision: 1 })],
    ['GET keys', w => keys(w.deps)],
  ])('%s is denied with 403 and no write', async (_name, run) => {
    const w = world()
    w.as('random-clerk-user')
    const { status, body } = await run(w)
    expect(status).toBe(403)
    expect(body.code).toBe('not_member')
    expect(w.collection.docs.size).toBe(0)
    expect(w.collection.log.writes).toEqual([])
  })

  it('denies a student whose class is not attached, and denies all students when nothing is attached', async () => {
    const w = world({ attached: ['class-a'] })
    w.as('stu-b1')
    expect((await getRecord(w.deps)).status).toBe(403)
    const none = world({ attached: [] })
    none.as('stu-a1')
    expect((await getRecord(none.deps)).status).toBe(403)
  })

  it('ignores class, group, seat and role claimed in the query, headers or body', async () => {
    const w = world()
    w.as('random-clerk-user')
    const r = await call(handleRecordsGet, w.deps, 'GET', `${RECORDS}?slug=${SLUG}&classId=class-a&scope=group:g1&role=teacher`, { headers: { 'x-role': 'teacher' } })
    expect(r.status).toBe(403)
    w.as('stu-a1')
    // A student naming another class or team gets a refusal (review mode), never that team's data.
    const peek = await call(handleRecordsGet, w.deps, 'GET', `${RECORDS}?slug=${SLUG}&classId=class-b&scope=group:g2`)
    expect(peek.status).toBe(403)
    expect(peek.body.code).toBe('teacher_only')
    const own = await getRecord(w.deps)
    expect(own.status).toBe(200)
    expect(own.body.role).toBe('student')
    // An extra identity field in a body is rejected rather than trusted.
    const forged = await put(w.deps, { slug: SLUG, viewer: own.body.viewer, baseRevision: 0, doc: fullDoc(project), classId: 'class-b', scope: 'group:g2' })
    expect(forged.status).toBe(400)
    expect(w.collection.docs.size).toBe(0)
  })
})

describe('same-origin and request limits', () => {
  it('rejects mutations from another origin, with no origin, or marked cross-site', async () => {
    const w = world()
    w.as('stu-a1')
    const viewer = (await getRecord(w.deps)).body.viewer
    const body = { slug: SLUG, viewer, baseRevision: 0, doc: fullDoc(project) }
    expect((await put(w.deps, body, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await put(w.deps, body, { origin: null })).status).toBe(403)
    expect((await put(w.deps, body, { headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
    expect((await act(w.deps, { slug: SLUG, viewer, action: 'submit', baseRevision: 1 }, { origin: 'https://evil.example' })).status).toBe(403)
    expect(w.collection.docs.size).toBe(0)
    expect((await put(w.deps, body, { headers: { 'sec-fetch-site': 'same-origin' } })).status).toBe(200)
  })

  it('rejects non-JSON, malformed JSON and oversized bodies', async () => {
    const w = world()
    w.as('stu-a1')
    expect((await put(w.deps, undefined, { raw: 'a=b', headers: { 'content-type': 'text/plain' } })).status).toBe(415)
    expect((await put(w.deps, undefined, { raw: '{not json' })).status).toBe(400)
    const huge = JSON.stringify({ slug: SLUG, pad: 'x'.repeat(LIMITS.bodyBytes + 10) })
    expect((await put(w.deps, undefined, { raw: huge })).status).toBe(413)
    expect((await put(w.deps, undefined, { raw: '{}', headers: { 'content-length': String(LIMITS.bodyBytes + 1) } })).status).toBe(413)
    expect(w.collection.docs.size).toBe(0)
  })

  it('answers unexpected storage failures with a generic 503 and no internals', async () => {
    const w = world()
    w.as('stu-a1')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    w.deps.collection = async () => { throw new Error('mongodb://user:secret@host exploded') }
    const r = await getRecord(w.deps)
    expect(r.status).toBe(503)
    expect(JSON.stringify(r.body)).not.toMatch(/secret|mongodb|exploded/)
    expect(r.headers.get('cache-control')).toMatch(/no-store/)
    spy.mockRestore()
  })
})

describe('malicious, oversized and malformed data', () => {
  const rejects = async (mutate, pattern) => {
    const w = world()
    w.as('stu-a1')
    const viewer = (await getRecord(w.deps)).body.viewer
    const doc = fullDoc(project)
    const r = await put(w.deps, { slug: SLUG, viewer, baseRevision: 0, doc: mutate(doc) ?? doc })
    expect(r.status, JSON.stringify(r.body)).toBe(400)
    if (pattern) expect(r.body.error).toMatch(pattern)
    expect(w.collection.docs.size).toBe(0)
  }

  it('rejects unknown fields everywhere', async () => {
    await rejects(d => ({ ...d, admin: true }), /Unexpected/)
    await rejects(d => { d.plan.secret = 'x' }, /Unexpected/)
    await rejects(d => { d.dataset[0].extra = 1 }, /Unexpected/)
    await rejects(d => { d.dataset[0].cells.distanceMm.w = 1 }, /Unexpected/)
    await rejects(d => { d.answers.q1 = { choice: 'a', correct: true } }, /Unexpected/)
  })

  it('rejects prototype-pollution style keys', async () => {
    const w = world()
    w.as('stu-a1')
    const viewer = (await getRecord(w.deps)).body.viewer
    const raw = `{"slug":"${SLUG}","viewer":"${viewer}","baseRevision":0,"doc":{"answers":{"__proto__":{"choice":"a"}},"plan":{},"dataset":[],"todo":{}}}`
    expect((await put(w.deps, undefined, { raw })).status).toBe(400)
    const raw2 = `{"slug":"${SLUG}","viewer":"${viewer}","baseRevision":0,"doc":{"todo":{"constructor":true}}}`
    expect((await put(w.deps, undefined, { raw: raw2 })).status).toBe(400)
    expect({}.polluted).toBeUndefined()
  })

  it('enforces text, row and number limits', async () => {
    await rejects(d => { d.plan.question = 'x'.repeat(LIMITS.planText + 1) }, /too long/)
    await rejects(d => { d.answers.q3 = { text: 'x'.repeat(LIMITS.longText + 1) } }, /too long/)
    await rejects(d => { d.dataset = Array.from({ length: LIMITS.datasetRows + 1 }, (_, i) => ({ id: 'r' + i, source: 'simulation', note: '', cells: {} })) }, /Too many rows/)
    await rejects(d => { d.dataset[0].note = 'n'.repeat(LIMITS.noteText + 1) }, /too long/)
    await rejects(d => { d.dataset[0].cells.distanceMm.v = 1e300 }, /finite/)
    await rejects(d => { d.dataset[0].cells.distanceMm.v = '12' }, /finite/)
    await rejects(d => { d.dataset[0].cells.distanceMm.u = -1 }, /negative/)
    await rejects(d => { d.dataset[0].cells.naEffective = { v: 1, u: 0.1 } }, /does not take an uncertainty/)
    await rejects(d => { d.plan.model = 'bell\u0007char' }, /control/)
  })

  it('rejects unknown ids and bad types', async () => {
    await rejects(d => { d.answers.q99 = { text: 'x' } }, /Unknown question/)
    await rejects(d => { d.answers.q1 = { choice: 'z' } }, /Unknown option/)
    await rejects(d => { d.answers.q1 = { text: 'free text' } }, /no text/)
    await rejects(d => { d.answers.q3 = { choice: 'a' } }, /not multiple choice/)
    await rejects(d => { d.answers.q4 = { value: 'abc' } }, /number/)
    await rejects(d => { d.answers.q4 = { value: '1e999' } }, /out of range/)
    await rejects(d => { d.answers = [] }, /Expected an object/)
    await rejects(d => { d.todo['eq:nope'] = true }, /Unknown to-do/)
    await rejects(d => { d.todo['sf:s-approve'] = 'yes' }, /true or false/)
    await rejects(d => { d.dataset[0].cells.bogus = { v: 1 } }, /Unknown column/)
    await rejects(d => { d.dataset[1].id = d.dataset[0].id }, /Duplicate row/)
    await rejects(d => { d.dataset[0].id = 'bad id!' }, /Invalid row id/)
    await rejects(d => { d.dataset[0].source = 'imported' }, /simulation or measured/)
  })

  it('rejects an invalid revision and an unknown field in the envelope', async () => {
    const w = world()
    w.as('stu-a1')
    const viewer = (await getRecord(w.deps)).body.viewer
    for (const baseRevision of [-1, 1.5, '0', null, 1e9]) {
      expect((await put(w.deps, { slug: SLUG, viewer, baseRevision, doc: fullDoc(project) })).status).toBe(400)
    }
    expect((await put(w.deps, { slug: SLUG, viewer, baseRevision: 0, doc: fullDoc(project), force: true })).status).toBe(400)
  })

  it('stores hostile-looking text inertly and returns it only as JSON text', async () => {
    const w = world()
    const evil = '<img src=x onerror=alert(1)></script>{"$where":"1"}'
    const r = await save(w, 'stu-a1', fullDoc(project, { answers: { q3: { text: evil } } }), 0)
    expect(r.status).toBe(200)
    expect(r.body.record.doc.answers.q3.text).toBe(evil)
    expect(r.headers.get('content-type')).toMatch(/application\/json/)
  })
})

describe('refresh persistence and isolation between teams and classes', () => {
  it('keeps a first save and returns it on a later load, as after a page refresh', async () => {
    const w = world()
    const doc = fullDoc(project, { answers: { q1: { choice: 'c' }, q4: { value: '0.283', text: 'worked' } } })
    const saved = await save(w, 'stu-a1', doc, 0)
    expect(saved.status).toBe(200)
    expect(saved.body.record).toMatchObject({ revision: 1, status: 'draft', exists: true })
    w.as('stu-a1')
    const again = await getRecord(w.deps)
    expect(again.body.record.doc).toEqual(saved.body.record.doc)
    expect(again.body.record.revision).toBe(1)
    expect(again.body.record.updatedBy.label).toBe('Avery')
  })

  it('shares one record inside a group and keeps other groups and individuals apart', async () => {
    const w = world()
    await save(w, 'stu-a1', fullDoc(project, { plan: { question: 'Group one question text', model: '', dataPlan: '', uncertainty: '', improvement: '' } }), 0)
    w.as('stu-a2')
    const mate = await getRecord(w.deps)
    expect(mate.body.record.doc.plan.question).toBe('Group one question text')
    w.as('stu-a3')
    const other = await getRecord(w.deps)
    expect(other.body.record.revision).toBe(0)
    expect(other.body.record.doc.plan.question).toBe('')
    w.as('stu-solo')
    expect((await getRecord(w.deps)).body.record.revision).toBe(0)
    expect(JSON.stringify(other.body)).not.toContain('Group one')
  })

  it('does not let a student in another group overwrite or read a record, even knowing its revision', async () => {
    const w = world()
    await save(w, 'stu-a1', fullDoc(project), 0)
    const before = structuredClone([...w.collection.docs.values()])
    const r = await save(w, 'stu-a3', fullDoc(project, { plan: { question: 'Intruder text for plan', model: '', dataPlan: '', uncertainty: '', improvement: '' } }), 1)
    expect(r.status).toBe(409)
    expect([...w.collection.docs.values()].find(d => d.scope === 'group:g1')).toEqual(before[0])
    expect(JSON.stringify(r.body)).not.toContain('A clear, bounded statement')
  })

  it('separates the same group id in two attached classes', async () => {
    const w = world({ attached: ['class-a', 'class-b'] })
    await save(w, 'stu-a1', fullDoc(project, { plan: { question: 'Class A group one plan', model: '', dataPlan: '', uncertainty: '', improvement: '' } }), 0)
    w.as('stu-b1')
    const b = await getRecord(w.deps)
    expect(b.status).toBe(200)
    expect(b.body.record.revision).toBe(0)
    const saved = await save(w, 'stu-b1', fullDoc(project, { plan: { question: 'Class B group one plan', model: '', dataPlan: '', uncertainty: '', improvement: '' } }), 0)
    expect(saved.status).toBe(200)
    expect(w.collection.docs.size).toBe(2)
    w.as('stu-a2')
    expect((await getRecord(w.deps)).body.record.doc.plan.question).toBe('Class A group one plan')
  })

  it('writes only to the dedicated collection and never to workshop or class data', async () => {
    const w = world()
    await save(w, 'stu-a1', fullDoc(project), 0)
    expect(w.collection.log.writes).toEqual(['insert'])
    for (const doc of w.collection.docs.values()) {
      expect(Object.keys(doc)).toEqual(expect.arrayContaining(['classId', 'scope', 'slug', 'revision', 'status']))
    }
    expect(researchCollectionName({})).toBe('researchProjectRecords')
    expect(researchCollectionName({ VERCEL_ENV: 'production', VERCEL_URL: 'x.vercel.app' })).toBe('researchProjectRecords')
    const preview = researchCollectionName({ VERCEL_ENV: 'preview', VERCEL_URL: 'fit-abc.vercel.app' })
    expect(preview).toMatch(/^researchPreview_[0-9a-f]{16}_researchProjectRecords$/)
    expect(researchCollectionName({ VERCEL_ENV: 'preview', VERCEL_URL: 'other.vercel.app' })).not.toBe(preview)
    expect(() => researchCollectionName({ VERCEL_ENV: 'preview', VERCEL_URL: 'evil.example.com' })).toThrow(/identity/)
    expect(() => researchCollectionName({ VERCEL_ENV: 'preview' })).toThrow(/identity/)
  })
})

describe('revisions, races and conflicts', () => {
  const planWith = text => ({ question: text, model: '', dataPlan: '', uncertainty: '', improvement: '' })

  it('bumps the revision on each save and reports no-ops as unchanged', async () => {
    const w = world()
    expect((await save(w, 'stu-a1', fullDoc(project), 0)).body.record.revision).toBe(1)
    const edit = fullDoc(project, { plan: planWith('Second edit of the plan') })
    const second = await save(w, 'stu-a1', edit)
    expect(second.body.record.revision).toBe(2)
    const same = await save(w, 'stu-a1', edit)
    expect(same.status).toBe(200)
    expect(same.body.unchanged).toBe(true)
    expect(same.body.record.revision).toBe(2)
  })

  it('answers a stale save with a 409 that carries the current record and leaves it untouched', async () => {
    const w = world()
    await save(w, 'stu-a1', fullDoc(project), 0)
    const a = await save(w, 'stu-a1', fullDoc(project, { plan: planWith('Avery edit one') }), 1)
    expect(a.body.record.revision).toBe(2)
    const stale = await save(w, 'stu-a2', fullDoc(project, { plan: planWith('Blair stale edit') }), 1)
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('conflict')
    expect(stale.body.current.revision).toBe(2)
    expect(stale.body.current.doc.plan.question).toBe('Avery edit one')
    const stored = [...w.collection.docs.values()][0]
    expect(stored.plan.question).toBe('Avery edit one')
    // Explicit resolution: the second student re-bases on the latest revision and saves on purpose.
    const redo = await save(w, 'stu-a2', fullDoc(project, { plan: planWith('Blair merged edit') }), 2)
    expect(redo.status).toBe(200)
    expect(redo.body.record.revision).toBe(3)
  })

  it('lets exactly one of two concurrent saves win and reports the other as a conflict', async () => {
    const w = world()
    await save(w, 'stu-a1', fullDoc(project), 0)
    w.as('stu-a1')
    const viewer1 = (await getRecord(w.deps)).body.viewer
    w.as('stu-a2')
    const viewer2 = (await getRecord(w.deps)).body.viewer
    // Same session identity is read at authenticate time, so run the two requests back to back with
    // identities pinned per request.
    const run = (userId, viewer, text) => {
      const deps = { ...w.deps, authenticate: async () => userId }
      return put(deps, { slug: SLUG, viewer, baseRevision: 1, doc: fullDoc(project, { plan: planWith(text) }) })
    }
    const updates = vi.spyOn(w.collection, 'updateOne')
    const [r1, r2] = await Promise.all([run('stu-a1', viewer1, 'Avery racing edit'), run('stu-a2', viewer2, 'Blair racing edit')])
    expect(updates).toHaveBeenCalledTimes(2) // both reached the compare-and-set; only one matched
    expect([r1.status, r2.status].sort()).toEqual([200, 409])
    const winner = r1.status === 200 ? r1 : r2
    const loser = r1.status === 200 ? r2 : r1
    const stored = [...w.collection.docs.values()][0]
    expect(stored.revision).toBe(2)
    expect(stored.plan.question).toBe(winner.body.record.doc.plan.question)
    expect(loser.body.current.revision).toBe(2)
  })

  it('creates one record when two members save for the first time at once', async () => {
    const w = world()
    w.as('stu-a1')
    const viewer1 = (await getRecord(w.deps)).body.viewer
    w.as('stu-a2')
    const viewer2 = (await getRecord(w.deps)).body.viewer
    const run = (userId, viewer, text) => put({ ...w.deps, authenticate: async () => userId }, { slug: SLUG, viewer, baseRevision: 0, doc: fullDoc(project, { plan: planWith(text) }) })
    const inserts = vi.spyOn(w.collection, 'insertOne')
    const [r1, r2] = await Promise.all([run('stu-a1', viewer1, 'First save by Avery'), run('stu-a2', viewer2, 'First save by Blair')])
    expect(inserts).toHaveBeenCalledTimes(2) // both raced to insert; the unique id let only one succeed
    expect([r1.status, r2.status].sort()).toEqual([200, 409])
    expect(w.collection.docs.size).toBe(1)
    const stored = [...w.collection.docs.values()][0]
    expect(stored.revision).toBe(1)
    const loser = r1.status === 409 ? r1 : r2
    expect(loser.body.current.revision).toBe(1)
    expect(loser.body.current.doc.plan.question).toBe(stored.plan.question)
  })

  it('refuses a first save when the record already exists, and a later save when it vanished', async () => {
    const w = world()
    await save(w, 'stu-a1', fullDoc(project), 0)
    expect((await save(w, 'stu-a2', fullDoc(project), 0)).status).toBe(409)
    w.collection.docs.clear()
    const gone = await save(w, 'stu-a1', fullDoc(project), 3)
    expect(gone.status).toBe(409)
    expect(w.collection.docs.size).toBe(0)
  })

  it('blocks a save made after the account changed in another tab', async () => {
    const w = world()
    w.as('stu-a1')
    const open = await getRecord(w.deps)
    w.as('stu-a3') // another tab signs in as someone else
    const r = await put(w.deps, { slug: SLUG, viewer: open.body.viewer, baseRevision: 0, doc: fullDoc(project) })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('account_changed')
    expect(w.collection.docs.size).toBe(0)
    w.as('teacher-1')
    const t = await put(w.deps, { slug: SLUG, viewer: open.body.viewer, baseRevision: 0, doc: fullDoc(project) })
    expect(t.status).toBe(403)
    expect(t.body.code).toBe('no_personal_work')
  })
})

describe('keys never travel with ordinary responses', () => {
  const allKeyText = () => Object.values(ANSWER_KEYS[SLUG]).flatMap(k => [k.why, k.working, ...(k.points || [])]).filter(Boolean)

  it('keeps key text out of every student read and write response before release', async () => {
    const w = world()
    const saved = await save(w, 'stu-a1', fullDoc(project, { answers: { q1: { choice: 'a' } } }), 0)
    w.as('stu-a1')
    const read1 = await getRecord(w.deps)
    for (const r of [saved, read1]) {
      const text = JSON.stringify(r.body)
      for (const piece of allKeyText()) expect(text).not.toContain(piece)
      expect(text).not.toMatch(/"correct"|startsWith|tolerancePct/)
    }
    expect((await keys(w.deps)).status).toBe(403)
    expect((await keys(w.deps)).body.code).toBe('keys_not_released')
  })
})
