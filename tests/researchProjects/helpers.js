// Shared synthetic fixtures for researchProjects tests.
// Everything here is SYNTHETIC: accounts, classes, groups and membership are made up for the tests.
// None of it represents live membership, and no production database is touched.
import { createReviewedRegistryMembership } from '@/lib/researchProjects/membership'

const tick = () => Promise.resolve()
const clone = v => (v === undefined ? v : structuredClone(v))

function matches(doc, filter) {
  return Object.entries(filter).every(([key, cond]) => {
    const value = doc[key]
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && '$in' in cond) return cond.$in.includes(value)
    return value === cond
  })
}

// Minimal in-memory stand-in for the Mongo calls the store uses. Each call is atomic, like a
// single-document Mongo operation, but yields first so concurrent requests really interleave.
export function createFakeCollection() {
  const docs = new Map()
  const log = { writes: [] }
  return {
    docs,
    log,
    async createIndex() {},
    async findOne(filter) {
      await tick()
      for (const doc of docs.values()) if (matches(doc, filter)) return clone(doc)
      return null
    },
    async insertOne(doc) {
      await tick()
      if (docs.has(doc._id)) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 })
      docs.set(doc._id, clone(doc))
      log.writes.push('insert')
      return { acknowledged: true }
    },
    async updateOne(filter, update) {
      await tick()
      for (const doc of docs.values()) {
        if (!matches(doc, filter)) continue
        Object.assign(doc, clone(update.$set || {}))
        for (const [field, spec] of Object.entries(update.$push || {})) {
          doc[field] = [...(doc[field] || []), ...clone(spec.$each)]
          if (spec.$slice && spec.$slice < 0) doc[field] = doc[field].slice(spec.$slice)
        }
        log.writes.push('update')
        return { matchedCount: 1, modifiedCount: 1 }
      }
      return { matchedCount: 0, modifiedCount: 0 }
    },
    find(filter, options = {}) {
      let rows = [...docs.values()].filter(d => matches(d, filter)).map(clone)
      const chain = {
        sort() { return chain },
        limit(n) { rows = rows.slice(0, n); return chain },
        async toArray() {
          await tick()
          return rows.map(r => {
            for (const [k, v] of Object.entries(options.projection || {})) if (v === 0) delete r[k]
            return r
          })
        },
      }
      return chain
    },
  }
}

export const ORIGIN = 'https://fit.test'

// session.userId is the currently signed-in synthetic user; null means signed out.
// Switching it mid-test simulates an account switch in another tab.
export function createWorld({ admins = ['teacher-1'], members = [], attached = ['class-a'] } = {}) {
  const session = { userId: null }
  const collection = createFakeCollection()
  let counter = 0
  let clock = Date.parse('2026-10-22T09:00:00Z')
  const deps = {
    async authenticate() {
      if (!session.userId) throw Object.assign(new Error('Unauthorized'), { name: 'UnauthorizedError' })
      return session.userId
    },
    async isAdmin(userId) { return admins.includes(userId) },
    membership: createReviewedRegistryMembership(members),
    attachedClassIds: attached,
    collection: async () => collection,
    now: () => new Date((clock += 1000)),
    newId: () => 'id-' + ++counter,
  }
  return { deps, session, collection }
}

export const reviewed = (userId, classId, groupId, memberId = userId + '-m', label = 'Student') => ({
  userId, classId, groupId, memberId, label, reviewedBy: 'synthetic-test', reviewedAt: '2026-10-22',
})

export const WORLD_MEMBERS = [
  reviewed('stu-a1', 'class-a', 'g1', 'm-a1', 'Avery'),
  reviewed('stu-a2', 'class-a', 'g1', 'm-a2', 'Blair'),
  reviewed('stu-a3', 'class-a', 'g2', 'm-a3', 'Casey'),
  reviewed('stu-b1', 'class-b', 'g1', 'm-b1', 'Devon'),
  reviewed('stu-solo', 'class-a', null, 'm-solo', 'Emery'),
]

export const SLUG = 'holobox-digital-holography'

export function request(method, path, { body, origin = ORIGIN, headers = {}, raw } = {}) {
  const init = { method, headers: { ...headers } }
  if (origin) init.headers.origin = origin
  if (body !== undefined || raw !== undefined) {
    init.headers['content-type'] = init.headers['content-type'] || 'application/json'
    init.body = raw !== undefined ? raw : JSON.stringify(body)
  }
  return new Request(ORIGIN + path, init)
}

export async function read(response) {
  return { status: response.status, headers: response.headers, body: await response.json() }
}

export function fullDoc(project, overrides = {}) {
  const safety = Object.fromEntries(project.todo.filter(t => t.id.startsWith('sf:')).map(t => [t.id, true]))
  const rows = [1, 2, 3].map(i => ({ id: 'r' + i, source: 'simulation', note: '', cells: { distanceMm: { v: 10 * i, u: 0.5 } } }))
  const long = 'A clear, bounded statement for the plan.'
  return {
    plan: { question: long, model: long, dataPlan: long, uncertainty: long, improvement: long },
    answers: {},
    dataset: rows,
    todo: safety,
    ...overrides,
  }
}

// ---- browser-side wiring for UI tests ----
// The UI talks to the REAL route handlers through a fake fetch, so UI and server are tested together.
import { vi } from 'vitest'
import { handleRecordsGet, handleRecordsPut, handleActionsPost, handleKeysGet } from '@/lib/researchProjects/http'

const ROUTES = {
  '/api/research-projects/records': { GET: handleRecordsGet, PUT: handleRecordsPut },
  '/api/research-projects/actions': { POST: handleActionsPost },
  '/api/research-projects/keys': { GET: handleKeysGet },
}

// world.hook(method, pathname, init) may return a Response, throw (for example TypeError to simulate
// being offline) or return undefined to let the real handler run.
export function installFetch(world) {
  world.calls = []
  world.hook = null
  const abortError = () => Object.assign(new Error('Aborted'), { name: 'AbortError' })
  const fetchMock = vi.fn(async (url, init = {}) => {
    const signal = init.signal
    if (signal?.aborted) throw abortError()
    const u = new URL(url, ORIGIN)
    const method = (init.method || 'GET').toUpperCase()
    world.calls.push({ method, path: u.pathname, search: u.search, body: init.body ? JSON.parse(init.body) : undefined })
    if (world.hook) {
      const custom = await world.hook(method, u.pathname, init)
      if (signal?.aborted) throw abortError()
      if (custom) return custom
    }
    const handler = ROUTES[u.pathname]?.[method]
    if (!handler) return new Response('not found', { status: 404 })
    const req = new Request(ORIGIN + u.pathname + u.search, {
      method,
      headers: { ...(init.headers || {}), origin: ORIGIN },
      body: init.body,
    })
    const response = await handler(req, world.deps)
    if (signal?.aborted) throw abortError()
    return response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export async function viewerFor(world, userId) {
  const { resolveAccess } = await import('@/lib/researchProjects/access')
  world.session.userId = userId
  return (await resolveAccess(null, world.deps)).viewer
}
