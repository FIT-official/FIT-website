// @vitest-environment node
// The two-owner audience: both owners get personal work, only the exact review owner can also review.
// SYNTHETIC accounts. Nothing here seeds, grants or reads any real membership.
import { describe, it, expect, vi } from 'vitest'
import { handleRecordsGet, handleRecordsPut, handleActionsPost, handleKeysGet, readJson } from '@/lib/researchProjects/http'
import { resolveAccess, defaultAccessDeps } from '@/lib/researchProjects/access'
import { getPageAccess } from '@/lib/researchProjects/pageAccess'
import { getProject } from '@/lib/researchProjects/content'
import { researchCollection } from '@/lib/researchProjects/store'
import { createWorld, WORLD_MEMBERS, request, read, fullDoc, SLUG } from './helpers'

// `server-only` throws outside a server bundle. This narrow mock lets server modules load under test.
vi.mock('server-only', () => ({}))

const project = getProject(SLUG)
const RECORDS = `/api/research-projects/records?slug=${SLUG}`
const call = async (handler, deps, method, path, opts) => read(await handler(request(method, path, opts), deps))

function world(options = {}) {
  const w = createWorld({ members: WORLD_MEMBERS, ...options })
  return { ...w, as: id => { w.session.userId = id } }
}

async function save(w, userId, doc) {
  w.as(userId)
  const open = await call(handleRecordsGet, w.deps, 'GET', RECORDS)
  return call(handleRecordsPut, w.deps, 'PUT', '/api/research-projects/records', { body: { slug: SLUG, viewer: open.body.viewer, baseRevision: open.body.record.revision, doc } })
}

describe('owner access modes', () => {
  it('gives the review owner both capabilities and the other owner personal work only', async () => {
    const w = world()
    w.as('owner-a')
    expect(await resolveAccess(null, w.deps)).toMatchObject({ role: 'teacher', canReview: true, personal: { memberId: 'm-owner-a', scope: 'member:m-owner-a' } })
    w.as('owner-b')
    expect(await resolveAccess(null, w.deps)).toMatchObject({ role: 'student', canReview: false, personal: { memberId: 'm-owner-b' } })
  })

  it('reports the same split to the page gate', async () => {
    const w = world()
    w.as('owner-a')
    expect(await getPageAccess(w.deps)).toMatchObject({ ok: true, canReview: true, hasPersonal: true, classIds: ['class-a'] })
    w.as('owner-b')
    expect(await getPageAccess(w.deps)).toMatchObject({ ok: true, canReview: false, hasPersonal: true, classIds: null })
  })

  it('lets both owners save personal answers, separately, and neither sees the other’s work as their own', async () => {
    const w = world()
    expect((await save(w, 'owner-a', fullDoc(project, { plan: { question: 'Owner A private plan text', model: '', dataPlan: '', uncertainty: '', improvement: '' } }))).status).toBe(200)
    expect((await save(w, 'owner-b', fullDoc(project, { plan: { question: 'Owner B private plan text', model: '', dataPlan: '', uncertainty: '', improvement: '' } }))).status).toBe(200)
    expect(w.collection.docs.size).toBe(2)
    w.as('owner-a')
    expect((await call(handleRecordsGet, w.deps, 'GET', RECORDS)).body.record.doc.plan.question).toBe('Owner A private plan text')
    w.as('owner-b')
    expect((await call(handleRecordsGet, w.deps, 'GET', RECORDS)).body.record.doc.plan.question).toBe('Owner B private plan text')
  })

  it('lets only the review owner review: list, open, give feedback and see keys', async () => {
    const w = world()
    await save(w, 'owner-b', fullDoc(project))
    w.as('owner-a')
    const overview = await call(handleRecordsGet, w.deps, 'GET', `${RECORDS}&classId=class-a`)
    expect(overview.status).toBe(200)
    expect(overview.body.records.map(r => r.scope)).toEqual(['member:m-owner-b'])
    const open = await call(handleRecordsGet, w.deps, 'GET', `${RECORDS}&classId=class-a&scope=member:m-owner-b`)
    expect(open.status).toBe(200)
    expect(open.body.canReview).toBe(true)
    expect(open.body.hasPersonal).toBe(true)
    const note = await call(handleActionsPost, w.deps, 'POST', '/api/research-projects/actions', { body: { slug: SLUG, viewer: open.body.viewer, action: 'feedback', outcome: 'comment', comment: 'Looks good so far.', classId: 'class-a', scope: 'member:m-owner-b', reviewRevision: open.body.record.reviewRevision, baseRevision: open.body.record.revision } })
    expect(note.status).toBe(200)
    expect((await call(handleKeysGet, w.deps, 'GET', `/api/research-projects/keys?slug=${SLUG}`)).status).toBe(200)

    w.as('owner-b')
    for (const path of [`${RECORDS}&classId=class-a`, `${RECORDS}&classId=class-a&scope=member:m-owner-a`]) {
      const denied = await call(handleRecordsGet, w.deps, 'GET', path)
      expect(denied.status).toBe(403)
      expect(denied.body.code).toBe('teacher_only')
    }
    const keys = await call(handleKeysGet, w.deps, 'GET', `/api/research-projects/keys?slug=${SLUG}`)
    expect(keys.status).toBe(403)
    expect(keys.body.code).toBe('keys_not_released')
  })

  it('does not let a reviewer-only account save work, but lets a reviewer with personal work do both', async () => {
    const w = world()
    w.as('teacher-1')
    const open = await call(handleRecordsGet, w.deps, 'GET', RECORDS)
    expect(open.status).toBe(403)
    expect(open.body.code).toBe('no_personal_work')
    expect((await save(w, 'owner-a', fullDoc(project))).status).toBe(200)
  })

  it('has different viewer keys for the same person in a different capability set', async () => {
    const w = world()
    w.as('owner-a')
    const both = (await resolveAccess(null, w.deps)).viewer
    const reviewOnly = createWorld({ members: [], admins: ['owner-a'] })
    reviewOnly.session.userId = 'owner-a'
    expect((await resolveAccess(null, reviewOnly.deps)).viewer).not.toBe(both)
  })

  it('refuses a review account that is not the exact owner even if Clerk calls it an admin', async () => {
    const w = world({ admins: ['owner-a'] })
    w.as('some-other-admin')
    await expect(resolveAccess(null, w.deps)).rejects.toMatchObject({ status: 403, code: 'not_member' })
  })

  it('ships with review default-deny, so no existing admin is admitted before the exact owner resolver is bound', async () => {
    const deps = defaultAccessDeps()
    expect(await deps.canReview('any-clerk-admin')).toBe(false)
    expect(deps.attachedClassIds).toEqual([])
    expect(await deps.membership.resolve({ userId: 'owner-a' })).toBeNull()
  })

  it('a personal member who is attached in a class that is not attached gets nothing, even if they could review', async () => {
    const w = world({ attached: [] })
    w.as('owner-a')
    const access = await resolveAccess(null, w.deps)
    expect(access.personal).toBeNull()
    expect(access.canReview).toBe(true)
    w.as('owner-b')
    await expect(resolveAccess(null, w.deps)).rejects.toMatchObject({ code: 'not_member' })
  })
})

describe('ordering follow-ups', () => {
  it('validates a review target before the collection is opened', async () => {
    const w = world()
    const opened = vi.fn(w.deps.collection)
    w.deps.collection = opened
    w.as('owner-a')
    const open = await call(handleRecordsGet, w.deps, 'GET', RECORDS)
    expect(opened).toHaveBeenCalledTimes(1) // the personal record read
    opened.mockClear()
    const bad = [
      `${RECORDS}&classId=class-a&scope=../etc`, `${RECORDS}&classId=%24ne&scope=group:g1`, `${RECORDS}&classId=class-zzz&scope=group:g1`,
    ]
    for (const path of bad) {
      const res = await call(handleRecordsGet, w.deps, 'GET', path)
      expect([400, 409]).toContain(res.status)
    }
    const keysBad = await call(handleKeysGet, w.deps, 'GET', `/api/research-projects/keys?slug=${SLUG}&classId=class-a&scope=nope`)
    expect(keysBad.status).toBe(400)
    const base = { slug: SLUG, viewer: open.body.viewer, reviewRevision: 0, classId: 'class-a', scope: 'group:g1' }
    for (const body of [
      { ...base, scope: 'bad scope', action: 'safety_review', approved: true },
      { ...base, action: 'safety_review', approved: 'yes' },
      { ...base, action: 'release_keys', released: 1 },
      { ...base, action: 'feedback', outcome: 'maybe' },
      { ...base, action: 'feedback', outcome: 'accept', comment: 'x', baseRevision: -1 },
      { ...base, action: 'feedback', outcome: 'comment', comment: '', rubric: {} },
      { ...base, action: 'nonsense' },
      { ...base, action: 'safety_review', approved: true, extra: 1 },
      { ...base, reviewRevision: 'x', action: 'safety_review', approved: true },
    ]) {
      const res = await call(handleActionsPost, w.deps, 'POST', '/api/research-projects/actions', { body })
      expect(res.status, JSON.stringify(body)).toBeGreaterThanOrEqual(400)
      expect(res.status).toBeLessThan(500)
    }
    expect(opened).not.toHaveBeenCalled()
  })

  it('reads the review owner’s keys without opening the database', async () => {
    const w = world()
    const opened = vi.fn(w.deps.collection)
    w.deps.collection = opened
    w.as('owner-a')
    const keys = await call(handleKeysGet, w.deps, 'GET', `/api/research-projects/keys?slug=${SLUG}`)
    expect(keys.status).toBe(200)
    expect(Object.keys(keys.body.keys).length).toBe(project.questions.length)
    expect(opened).not.toHaveBeenCalled()
  })

  it('creates no index on any read or write path', async () => {
    const w = world()
    const indexes = vi.spyOn(w.collection, 'createIndex')
    await save(w, 'owner-a', fullDoc(project))
    w.as('owner-a')
    await call(handleRecordsGet, w.deps, 'GET', `${RECORDS}&classId=class-a`)
    expect(indexes).not.toHaveBeenCalled()
    // researchCollection() only returns the collection; it never calls createIndex.
    const calls = []
    vi.doMock('@/lib/db', () => ({ connectToDatabase: async () => ({ connection: { db: { collection: name => ({ name, createIndex: (...a) => calls.push(a) }) } } }) }))
    const col = await researchCollection()
    expect(col.name).toBe('researchProjectRecords')
    expect(calls).toEqual([])
    vi.doUnmock('@/lib/db')
  })
})

describe('bounded request bodies', () => {
  const json = (body, headers = {}) => new Request('https://fit.test/x', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body, duplex: 'half' })

  it('stops reading a stream once it passes the limit, without buffering the rest', async () => {
    let pulled = 0
    let cancelled = false
    const chunk = new TextEncoder().encode('x'.repeat(1000))
    const stream = new ReadableStream({
      pull(controller) {
        pulled++
        if (pulled > 10_000) controller.close()
        else controller.enqueue(chunk)
      },
      cancel() { cancelled = true },
    })
    await expect(readJson(json(stream), 5_000)).rejects.toMatchObject({ status: 413 })
    expect(cancelled).toBe(true)
    expect(pulled).toBeLessThan(20) // nowhere near the 10 000 chunks on offer
  })

  it('rejects a declared length over the limit without reading the body', async () => {
    let pulled = 0
    const stream = new ReadableStream({ pull(c) { pulled++; c.enqueue(new Uint8Array(10)) } })
    await expect(readJson(json(stream, { 'content-length': '999999' }), 5_000)).rejects.toMatchObject({ status: 413 })
    expect(pulled).toBeLessThan(3)
  })

  it('accepts a body exactly at the limit and rejects one byte more, counting bytes not characters', async () => {
    const at = JSON.stringify({ a: 'x'.repeat(100 - 8) })
    expect(new TextEncoder().encode(at).length).toBe(100)
    await expect(readJson(json(at), 100)).resolves.toEqual({ a: 'x'.repeat(92) })
    await expect(readJson(json(at + ' '), 100)).rejects.toMatchObject({ status: 413 })
    const multibyte = JSON.stringify({ a: 'é'.repeat(60) }) // 60 characters but 120 bytes
    await expect(readJson(json(multibyte), 100)).rejects.toMatchObject({ status: 413 })
  })

  it('rejects invalid UTF-8, empty bodies and wrong content types', async () => {
    await expect(readJson(json(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])))).rejects.toMatchObject({ status: 400 })
    await expect(readJson(new Request('https://fit.test/x', { method: 'POST', headers: { 'content-type': 'application/json' } }))).rejects.toMatchObject({ status: 400 })
    await expect(readJson(json('{}', { 'content-type': 'text/plain' }))).rejects.toMatchObject({ status: 415 })
  })

  it('does not read an unauthenticated upload at all', async () => {
    const w = world()
    let pulled = 0
    const stream = new ReadableStream({ pull(c) { pulled++; c.enqueue(new Uint8Array(1000)); if (pulled > 50) c.close() } })
    const req = new Request('https://fit.test/api/research-projects/records', { method: 'PUT', headers: { origin: 'https://fit.test', 'content-type': 'application/json' }, body: stream, duplex: 'half' })
    const res = await handleRecordsPut(req, w.deps)
    expect(res.status).toBe(401)
    expect(pulled).toBeLessThan(5)
  })
})
