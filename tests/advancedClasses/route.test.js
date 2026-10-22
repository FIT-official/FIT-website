import { beforeEach, describe, expect, it, vi } from 'vitest'

// The route runs with the REAL server-only bindings and the REAL default wiring. Only the existing Clerk
// seams are replaced by synthetic stand-ins: no network, no real provider, no real account is contacted.
const REAL_FIT = 'user_35KQJAephgWnwhNfPkBCpfZyV2Z'
const REAL_PERSONAL = 'user_3JoE2MXxLVzXFL6CZQPFwHbGvAv'

const state = vi.hoisted(() => ({ userId: null, admins: new Set(), users: {}, getUser: null }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/authenticate', () => ({
  UnauthorizedError: class UnauthorizedError extends Error { constructor() { super('Unauthorized'); this.name = 'UnauthorizedError' } },
  async authenticate() {
    if (!state.userId) { const e = new Error('Unauthorized'); e.name = 'UnauthorizedError'; throw e }
    return { userId: state.userId }
  },
}))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: async (id) => state.admins.has(id) }))
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: async () => ({ users: { getUser: (id) => state.getUser(id) } }) }))

const user = (id, email, role, status = 'verified') => ({ id, primaryEmailAddressId: 'e1', emailAddresses: [{ id: 'e1', emailAddress: email, verification: { status } }], publicMetadata: { role } })

beforeEach(() => {
  state.userId = null
  state.admins = new Set([REAL_FIT, 'user_SYNTHETIC_OTHER_ADMIN'])
  state.users = {
    [REAL_FIT]: user(REAL_FIT, 'fixittoday.contact@gmail.com', 'admin'),
    [REAL_PERSONAL]: user(REAL_PERSONAL, 'lwwenwei@gmail.com', 'user'),
  }
  state.getUser = vi.fn(async (id) => { if (!state.users[id]) throw new Error('missing'); return state.users[id] })
})

describe('GET/POST /api/admin/advanced-classes/access (real bindings, synthetic Clerk)', () => {
  it('denies anonymous and unrelated signed-in users with no identities and no provider calls', async () => {
    const { GET } = await import('@/app/api/admin/advanced-classes/access/route')
    for (const id of [null, 'user_SYNTHETIC_STRANGER']) {
      state.userId = id
      const response = await GET()
      const text = await response.text()
      expect(response.status).toBe(id ? 403 : 401)
      expect(text).not.toMatch(/user_3|@gmail|ac-m-/)
      expect(response.headers.get('Cache-Control')).toContain('no-store')
    }
    expect(state.getUser).not.toHaveBeenCalled()
  })

  it('shows the two approved owners to an existing admin, including an admin who is not an owner', async () => {
    const { GET } = await import('@/app/api/admin/advanced-classes/access/route')
    state.userId = 'user_SYNTHETIC_OTHER_ADMIN'
    const response = await GET()
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex')
    expect(json.accounts.map((a) => [a.userId, a.email, a.scope.review, a.verification.state, a.verification.effective.review])).toEqual([
      [REAL_FIT, 'fixittoday.contact@gmail.com', true, 'verified', true],
      [REAL_PERSONAL, 'lwwenwei@gmail.com', false, 'verified', false],
    ])
    expect(json.provenance.checkedAt).toBe('2026-10-22T08:28:00Z')
  })

  it('cannot grant through POST, PUT, PATCH or DELETE', async () => {
    const route = await import('@/app/api/admin/advanced-classes/access/route')
    state.userId = REAL_FIT
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await route[method](new Request('http://x/api', { method, body: JSON.stringify({ userId: 'user_SYNTHETIC_STRANGER' }) }))
      expect(response.status).toBe(405)
      expect(response.headers.get('Cache-Control')).toContain('no-store')
    }
    expect(state.getUser).not.toHaveBeenCalled()
  })

  it('declares dynamic rendering', async () => {
    const route = await import('@/app/api/admin/advanced-classes/access/route')
    expect(route.dynamic).toBe('force-dynamic')
  })
})

describe('real bindings', () => {
  it('bind exactly the two approved accounts and never grant the personal account review', async () => {
    const { OWNER_BINDINGS, BINDINGS_PROVENANCE } = await import('@/lib/advancedClasses/bindings.server')
    expect(OWNER_BINDINGS.map((b) => [b.userId, b.expectedEmail, b.review, b.content, b.personalWork])).toEqual([
      [REAL_FIT, 'fixittoday.contact@gmail.com', true, 'full-library', true],
      [REAL_PERSONAL, 'lwwenwei@gmail.com', false, 'full-library', true],
    ])
    expect(new Set(OWNER_BINDINGS.map((b) => b.memberScope)).size).toBe(2)
    expect(Object.isFrozen(OWNER_BINDINGS)).toBe(true)
    expect(BINDINGS_PROVENANCE.checkedAt).toBe('2026-10-22T08:28:00Z')
  })

  it('gate allows only the verified exact owners', async () => {
    const { getOwnerGate } = await import('@/lib/advancedClasses/defaults.server')
    const gate = (id) => getOwnerGate({ authenticate: async () => id, fetchUser: (x) => state.getUser(x) })
    expect(await gate(REAL_FIT)).toEqual({ allowed: true, signedIn: true, review: true })
    expect(await gate(REAL_PERSONAL)).toEqual({ allowed: true, signedIn: true, review: false })
    expect(await gate('user_SYNTHETIC_OTHER_ADMIN')).toEqual({ allowed: false, signedIn: true, review: false })
    state.users[REAL_PERSONAL] = user(REAL_PERSONAL, 'lwwenwei@gmail.com', 'user', 'unverified')
    expect((await gate(REAL_PERSONAL)).allowed).toBe(false)
    state.getUser = vi.fn().mockRejectedValue(new Error('down'))
    expect((await gate(REAL_FIT)).allowed).toBe(false)
    const anon = await getOwnerGate({ authenticate: async () => { throw new Error('no session') } })
    expect(anon).toEqual({ allowed: false, signedIn: false, review: false })
  })
})
