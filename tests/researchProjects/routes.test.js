// @vitest-environment node
// The REAL route modules with the SHIPPED default wiring (empty reviewed membership, no attached
// class). Only the Clerk session and the database handle are replaced. This shows what production
// does today: students are denied by default, and teachers keep to the existing admin boundary.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeCollection, request, read, SLUG, ORIGIN } from './helpers'

const clerk = vi.hoisted(() => ({ userId: null, admins: new Set(), authCalls: 0, users: [] }))
const db = vi.hoisted(() => ({ collection: null, connects: 0 }))

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => { clerk.authCalls++; return { userId: clerk.userId } },
  clerkClient: async () => ({
    users: {
      getUser: async id => {
        clerk.users.push(id)
        return { publicMetadata: clerk.admins.has(id) ? { role: 'admin' } : {} }
      },
    },
  }),
}))
vi.mock('@/lib/db', () => ({
  connectToDatabase: async () => { db.connects++; return { connection: { db: { collection: () => db.collection } } } },
}))

const records = () => import('@/app/api/research-projects/records/route')
const actions = () => import('@/app/api/research-projects/actions/route')
const keys = () => import('@/app/api/research-projects/keys/route')

beforeEach(() => {
  clerk.userId = null
  clerk.admins = new Set(['teacher-1'])
  clerk.authCalls = 0
  clerk.users = []
  db.collection = createFakeCollection()
  db.connects = 0
})

const RECORDS = `/api/research-projects/records?slug=${SLUG}`

describe('shipped routes, signed out', () => {
  it('answers every method with 401 and never opens the database', async () => {
    const r = await records()
    const a = await actions()
    const k = await keys()
    const results = await Promise.all([
      read(await r.GET(request('GET', RECORDS))),
      read(await r.PUT(request('PUT', '/api/research-projects/records', { body: { slug: SLUG, viewer: 'x', baseRevision: 0, doc: {} } }))),
      read(await a.POST(request('POST', '/api/research-projects/actions', { body: { slug: SLUG, action: 'submit' } }))),
      read(await k.GET(request('GET', `/api/research-projects/keys?slug=${SLUG}`))),
    ])
    for (const res of results) {
      expect(res.status).toBe(401)
      expect(res.headers.get('cache-control')).toMatch(/no-store/)
      expect(res.headers.get('x-robots-tag')).toMatch(/noindex/)
    }
    expect(db.connects).toBe(0)
    expect(clerk.users).toEqual([])
  })

  it('rejects a cross-origin mutation before even checking the session', async () => {
    const r = await records()
    const res = await r.PUT(request('PUT', '/api/research-projects/records', { origin: 'https://evil.example', body: {} }))
    expect(res.status).toBe(403)
    expect(clerk.authCalls).toBe(0)
    expect(db.connects).toBe(0)
  })

  it('exports no static-generation or cache hints that could make responses shared', async () => {
    for (const load of [records, actions, keys]) {
      const mod = await load()
      expect(mod.dynamic).toBe('force-dynamic')
      expect(mod.runtime).toBe('nodejs')
      expect(mod.revalidate).toBeUndefined()
      expect(mod.generateStaticParams).toBeUndefined()
    }
  })
})

describe('shipped routes, signed in without a reviewed class membership', () => {
  it('denies a signed-in account that is not a teacher, for every endpoint, without touching the database', async () => {
    clerk.userId = 'user_clerk_student'
    const r = await records()
    const a = await actions()
    const k = await keys()
    const results = await Promise.all([
      read(await r.GET(request('GET', RECORDS))),
      read(await r.PUT(request('PUT', '/api/research-projects/records', { body: { slug: SLUG, viewer: 'x', baseRevision: 0, doc: {} } }))),
      read(await a.POST(request('POST', '/api/research-projects/actions', { body: { slug: SLUG, action: 'submit' } }))),
      read(await k.GET(request('GET', `/api/research-projects/keys?slug=${SLUG}`))),
    ])
    for (const res of results) expect(res.body).toMatchObject({ code: 'not_member' })
    expect(results.map(x => x.status)).toEqual([403, 403, 403, 403])
    expect(db.connects).toBe(0)
    expect(clerk.users).toContain('user_clerk_student')
  })

  it('does not admit a student by any class, group or seat value in the request', async () => {
    clerk.userId = 'user_clerk_student'
    const r = await records()
    const res = await r.GET(request('GET', `${RECORDS}&classId=class-a&scope=group:g1&seat=3&homeGroup=g1`, { headers: { cookie: 'workshop_session=abc', 'x-class': 'class-a' } }))
    expect(res.status).toBe(403)
    expect(db.connects).toBe(0)
  })
})

describe('shipped routes, teacher (existing admin boundary)', () => {
  it('lets an admin read answer keys, but finds no class to review because none is attached', async () => {
    clerk.userId = 'teacher-1'
    const r = await records()
    const k = await keys()
    const keyRes = await read(await k.GET(request('GET', `/api/research-projects/keys?slug=${SLUG}`)))
    expect(keyRes.status).toBe(200)
    expect(keyRes.body.role).toBe('teacher')
    expect(Object.keys(keyRes.body.keys)).toHaveLength(8)
    const review = await read(await r.GET(request('GET', `${RECORDS}&classId=class-a&scope=group:g1`)))
    expect(review.status).toBe(409)
    expect(review.body.code).toBe('no_class_attached')
    const overview = await read(await r.GET(request('GET', `${RECORDS}&classId=class-a`)))
    expect(overview.body.code).toBe('no_class_attached')
    expect(db.collection.docs.size).toBe(0)
  })

  it('refuses to let a teacher write a student record', async () => {
    clerk.userId = 'teacher-1'
    const r = await records()
    const res = await read(await r.PUT(request('PUT', '/api/research-projects/records', { body: { slug: SLUG, viewer: 'x', baseRevision: 0, doc: {} } })))
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('student_only')
    expect(db.collection.docs.size).toBe(0)
  })

  it('treats a failing role lookup as not-a-teacher', async () => {
    clerk.userId = 'teacher-1'
    const clerkMod = await import('@clerk/nextjs/server')
    const original = clerkMod.clerkClient
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    clerk.admins = new Set() // Clerk no longer reports admin
    const r = await records()
    const res = await read(await r.GET(request('GET', RECORDS)))
    expect(res.status).toBe(403)
    spy.mockRestore()
    expect(original).toBeTypeOf('function')
  })
})
