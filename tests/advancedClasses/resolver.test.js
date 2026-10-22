import { describe, expect, it, vi } from 'vitest'
import { resolveOwnerAccess, DENY } from '@/lib/advancedClasses/resolver'
import { BINDINGS, FIT, PERSONAL, OTHER_ADMIN, STRANGER, clerkUser, directory } from './fixtures'

const run = (userId, dir) => resolveOwnerAccess({ userId, bindings: BINDINGS, fetchUser: dir.fetchUser })

describe('owner access resolver (synthetic users)', () => {
  it('denies anonymous, unrelated signed-in and arbitrary other admin without calling the provider', async () => {
    const dir = directory()
    for (const id of [null, undefined, '', STRANGER, OTHER_ADMIN]) expect((await run(id, dir)).allowed).toBe(false)
    expect((await run(OTHER_ADMIN, dir)).reason).toBe(DENY.unknown)
    expect(dir.calls).toEqual([])
  })

  it('allows both exact owners only with a verified current binding', async () => {
    const dir = directory()
    const fit = await run(FIT, dir)
    const personal = await run(PERSONAL, dir)
    expect(fit).toMatchObject({ allowed: true, memberScope: 'ac-m-synth-fit', scope: { content: 'full-library', personalWork: true, review: true } })
    expect(personal).toMatchObject({ allowed: true, memberScope: 'ac-m-synth-personal', scope: { content: 'full-library', personalWork: true, review: false } })
  })

  it('FIT teacher review needs the live admin role', async () => {
    const dir = directory({ [FIT]: clerkUser(FIT, 'synthetic-fit@example.test', { role: 'user' }) })
    const fit = await run(FIT, dir)
    expect(fit.allowed).toBe(true)
    expect(fit.scope.review).toBe(false)
  })

  it('never grants review to the personal account even if it later holds the admin role', async () => {
    const dir = directory({ [PERSONAL]: clerkUser(PERSONAL, 'synthetic-personal@example.test', { role: 'admin' }) })
    const personal = await run(PERSONAL, dir)
    expect(personal.allowed).toBe(true)
    expect(personal.scope.review).toBe(false)
  })

  it.each([
    ['unverified email', clerkUser(FIT, 'synthetic-fit@example.test', { role: 'admin', status: 'unverified' }), DENY.unverified],
    ['mismatched email', clerkUser(FIT, 'someone-else@example.test', { role: 'admin' }), DENY.emailMismatch],
    ['domain or substring only', clerkUser(FIT, 'xsynthetic-fit@example.test', { role: 'admin' }), DENY.emailMismatch],
    ['verified email that is not primary', clerkUser(FIT, 'synthetic-fit@example.test', { role: 'admin', primary: false }), DENY.emailMismatch],
    ['different user id returned', clerkUser(STRANGER, 'synthetic-fit@example.test', { role: 'admin' }), DENY.mismatch],
    ['banned account', clerkUser(FIT, 'synthetic-fit@example.test', { role: 'admin', extra: { banned: true } }), DENY.blocked],
    ['locked account', clerkUser(FIT, 'synthetic-fit@example.test', { role: 'admin', extra: { locked: true } }), DENY.blocked],
    ['empty user', null, DENY.mismatch],
  ])('denies %s', async (_name, user, reason) => {
    const result = await run(FIT, { fetchUser: async () => user })
    expect(result).toEqual({ allowed: false, reason })
  })

  it('denies when the provider fails', async () => {
    const fetchUser = vi.fn().mockRejectedValue(new Error('clerk 500 secret detail'))
    const result = await resolveOwnerAccess({ userId: PERSONAL, bindings: BINDINGS, fetchUser })
    expect(result).toEqual({ allowed: false, reason: DENY.unavailable })
  })

  it('rejects malformed or duplicate bindings', async () => {
    await expect(resolveOwnerAccess({ userId: FIT, bindings: [BINDINGS[0], BINDINGS[0]], fetchUser: async () => ({}) })).rejects.toThrow('Duplicate')
    await expect(resolveOwnerAccess({ userId: FIT, bindings: [{ userId: FIT }], fetchUser: async () => ({}) })).rejects.toThrow('incomplete')
  })
})
