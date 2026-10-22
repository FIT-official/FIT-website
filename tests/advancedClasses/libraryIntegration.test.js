// Real production owner adapter + route modules; only Clerk and Mongo transport are synthetic.
// These tests do not authenticate or write any real account.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeCollection, request, read, SLUG } from '../researchProjects/helpers'
import { emptyDocument } from '@/lib/researchProjects/shared'

const state = vi.hoisted(() => ({ userId: null, users: {}, collection: null, providerCalls: 0 }))
vi.mock('server-only', () => ({}))
// Stub the provider transport directly. Vitest's concurrent dynamic SDK imports
// can escape its Clerk mock; no real provider is part of this test.
vi.mock('@/lib/advancedClasses/defaults.server', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, ownerResearchInputs: () => ({
    ...actual.ownerResearchInputs(),
    fetchUser: async id => {
      state.providerCalls++
      if (!state.users[id]) throw new Error('synthetic provider unavailable')
      return state.users[id]
    },
  }) }
})
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: state.userId }),
  clerkClient: async () => ({ users: { getUser: async id => {
    state.providerCalls++
    if (!state.users[id]) throw new Error('synthetic provider unavailable')
    return state.users[id]
  } } }),
}))
vi.mock('@/lib/db', () => ({ connectToDatabase: async () => ({ connection: { db: { collection: () => state.collection } } }) }))
import { OWNER_BINDINGS } from '@/lib/advancedClasses/bindings.server'
import * as records from '@/app/api/research-projects/records/route'
import * as keys from '@/app/api/research-projects/keys/route'
import { defaultDeps } from '@/lib/researchProjects/deps'
import { getPageAccess } from '@/lib/researchProjects/pageAccess'
import { handleRecordsPut } from '@/lib/researchProjects/http'

const fit = OWNER_BINDINGS.find(b => b.review)
const personal = OWNER_BINDINGS.find(b => !b.review)
const recordPath = `/api/research-projects/records?slug=${SLUG}`
const live = b => ({ id: b.userId, primaryEmailAddressId: 'e', emailAddresses: [{ id: 'e', emailAddress: b.expectedEmail, verification: { status: 'verified' } }], publicMetadata: { role: b.review ? 'admin' : 'user' } })
beforeEach(() => {
  state.userId = null; state.providerCalls = 0
  state.users = Object.fromEntries(OWNER_BINDINGS.map(b => [b.userId, live(b)]))
  state.collection = createFakeCollection()
})
const get = path => records.GET(request('GET', path || recordPath)).then(read)
const save = (viewer, baseRevision, question) => {
  const doc = emptyDocument(); doc.plan.question = question
  return records.PUT(request('PUT', '/api/research-projects/records', { body: { slug: SLUG, viewer, baseRevision, doc } })).then(read)
}

describe('owner-only production integration', () => {
  it('rejects anonymous and unbound accounts, including other admins and forged review/class parameters', async () => {
    expect((await get()).status).toBe(401)
    state.userId = 'synthetic-other-admin'; state.users[state.userId] = { publicMetadata: { role: 'admin' } }
    expect((await get(recordPath + '&view=review&classId=ac-owner-workspace&scope=member:other')).status).toBe(403)
    expect(state.providerCalls).toBe(0)
    expect(state.collection.docs.size).toBe(0)
  })
  it('gives both approved owners separate durable personal work and ignores forged ownership', async () => {
    state.userId = fit.userId
    const first = await get(); expect(first.body.role).toBe('teacher')
    expect((await save(first.body.viewer, 0, 'FIT synthetic work')).status).toBe(200)
    state.userId = personal.userId
    expect((await get(recordPath + `&classId=${fit.workspaceId}&scope=member:${fit.memberScope}`)).status).toBe(403)
    const second = await get()
    expect(second.body.record.revision).toBe(0)
    expect(second.body.record.doc.plan.question).toBe('')
    expect((await save(second.body.viewer, 0, 'Personal synthetic work')).status).toBe(200)
    state.userId = fit.userId
    expect((await get()).body.record.doc.plan.question).toBe('FIT synthetic work')
    expect(state.collection.docs.size).toBe(2)
  })
  it('requires the exact FIT binding and live admin role for unreleased keys', async () => {
    const path = `/api/research-projects/keys?slug=${SLUG}`
    state.userId = fit.userId
    expect((await keys.GET(request('GET', path))).status).toBe(200)
    const review = await read(await keys.GET(request('GET', path + '&view=review')))
    expect(review.status).toBe(200); expect(review.body.role).toBe('teacher')
    expect(Object.keys(review.body.keys).length).toBeGreaterThan(0)
    state.userId = personal.userId
    expect((await keys.GET(request('GET', path + '&view=review'))).status).toBe(403)
    state.userId = fit.userId; state.users[fit.userId].publicMetadata.role = 'user'
    expect((await keys.GET(request('GET', path + '&view=review'))).status).toBe(403)
  })
  it('conflicts concurrent first saves and stale revisions instead of overwriting', async () => {
    state.userId = personal.userId
    const { body } = await get()
    // Exercise the real owner adapter and HTTP/service/store concurrency without
    // concurrent Vitest dynamic imports of the Mongo transport.
    const deps = { ...defaultDeps(), authenticate: async () => personal.userId, collection: async () => state.collection }
    const outcomes = await Promise.all(Array.from({ length: 6 }, (_, n) => {
      const doc = emptyDocument(); doc.plan.question = `Concurrent draft ${n}`
      return handleRecordsPut(request('PUT', '/api/research-projects/records', { body: { slug: SLUG, viewer: body.viewer, baseRevision: 0, doc } }), deps).then(read)
    }))
    expect(outcomes.filter(x => x.status === 200)).toHaveLength(1)
    expect(outcomes.filter(x => x.status === 409)).toHaveLength(5)
    expect((await save(body.viewer, 0, 'Stale overwrite')).status).toBe(409)
    expect((await get()).body.record.doc.plan.question).not.toBe('Stale overwrite')
  })
  it('stops account-switched saves and provider/verification failures', async () => {
    state.userId = fit.userId; const fitRead = await get()
    state.userId = personal.userId
    expect((await save(fitRead.body.viewer, 0, 'Wrong account')).status).toBe(409)
    state.users[personal.userId].emailAddresses[0].verification.status = 'unverified'
    expect((await get()).status).toBe(403)
    delete state.users[personal.userId]
    expect((await get()).status).toBe(403)
    expect(state.collection.docs.size).toBe(0)
  })
  it('exposes independent personal/review capabilities without identities in page props', async () => {
    state.userId = fit.userId
    const work = await getPageAccess(defaultDeps())
    const review = await getPageAccess(defaultDeps({ view: 'review' }))
    expect(work).toMatchObject({ role: 'teacher', canReview: true, hasPersonal: true })
    expect(review).toMatchObject({ role: 'teacher', canReview: true, hasPersonal: true })
    expect(work.viewer).toBe(review.viewer)
    expect(JSON.stringify(work)).not.toContain(fit.userId)
    state.userId = personal.userId
    expect(await getPageAccess(defaultDeps())).toMatchObject({ role: 'student', canReview: false })
  })
  it('marks every successful and denied API response private and non-cacheable', async () => {
    for (const id of [null, 'synthetic-stranger', fit.userId, personal.userId]) {
      state.userId = id
      const response = await get()
      expect(response.headers.get('Cache-Control')).toContain('private, no-store')
      expect(response.headers.get('Vary')).toContain('Cookie')
    }
  })
})
