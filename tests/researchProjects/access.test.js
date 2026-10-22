// @vitest-environment node
// Access adapter tests use SYNTHETIC accounts and an injected membership mapping.
// They prove the adapter's rules; they do not show that any real class has been connected.
import { describe, it, expect } from 'vitest'
import { resolveAccess, AccessError } from '@/lib/researchProjects/access'
import { activeMembership, denyAllMembership, createReviewedRegistryMembership, REVIEWED_MEMBERS } from '@/lib/researchProjects/membership'
import { ATTACHED_CLASS_IDS } from '@/lib/researchProjects/config'
import { getPageAccess } from '@/lib/researchProjects/pageAccess'
import { createWorld, WORLD_MEMBERS, reviewed } from './helpers'

const fails = async (promise, status, code) => {
  const error = await promise.then(() => null, e => e)
  expect(error).toBeInstanceOf(AccessError)
  expect({ status: error.status, code: error.code }).toEqual({ status, code })
}

describe('access adapter', () => {
  it('rejects a signed-out request with 401', async () => {
    const { deps } = createWorld({ members: WORLD_MEMBERS })
    await fails(resolveAccess(null, deps), 401, 'unauthenticated')
  })

  it('treats an unexpected authentication failure as unavailable, not as success', async () => {
    const { deps } = createWorld()
    deps.authenticate = async () => { throw new Error('clerk down') }
    await fails(resolveAccess(null, deps), 503, 'auth_unavailable')
  })

  it('does not treat a mere signed-in user as a member', async () => {
    const { deps, session } = createWorld({ members: WORLD_MEMBERS })
    session.userId = 'stranger'
    await fails(resolveAccess(null, deps), 403, 'not_member')
  })

  it('lets the existing admin boundary through as teacher', async () => {
    const { deps, session } = createWorld({ members: [] })
    session.userId = 'teacher-1'
    const access = await resolveAccess(null, deps)
    expect(access).toMatchObject({ role: 'teacher', userId: 'teacher-1' })
    expect(access.viewer).toMatch(/^[0-9a-f]{24}$/)
  })

  it('does not trust a request that claims to be a teacher or names a class, group or seat', async () => {
    const { deps, session } = createWorld({ members: WORLD_MEMBERS })
    session.userId = 'stranger'
    const forged = new Request('https://fit.test/api/research-projects/records?classId=class-a&group=g1&seat=1&role=teacher', {
      headers: { 'x-class-id': 'class-a', 'x-role': 'teacher' },
    })
    await fails(resolveAccess(forged, deps), 403, 'not_member')
  })

  it('admits a student only when the reviewed mapping names them and the class is attached', async () => {
    const { deps, session } = createWorld({ members: WORLD_MEMBERS })
    session.userId = 'stu-a1'
    const access = await resolveAccess(null, deps)
    expect(access).toMatchObject({ role: 'student', classId: 'class-a', groupId: 'g1', scope: 'group:g1', memberId: 'm-a1' })
  })

  it('denies a mapped student whose class is not attached to the library', async () => {
    const { deps, session } = createWorld({ members: WORLD_MEMBERS, attached: ['class-a'] })
    session.userId = 'stu-b1'
    await fails(resolveAccess(null, deps), 403, 'not_member')
  })

  it('denies everyone when no class is attached', async () => {
    const { deps, session } = createWorld({ members: WORLD_MEMBERS, attached: [] })
    session.userId = 'stu-a1'
    await fails(resolveAccess(null, deps), 403, 'not_member')
  })

  it('gives an individual scope to a student with no group', async () => {
    const { deps, session } = createWorld({ members: WORLD_MEMBERS })
    session.userId = 'stu-solo'
    expect((await resolveAccess(null, deps)).scope).toBe('member:m-solo')
  })

  it('gives different viewer keys to different accounts and scopes', async () => {
    const { deps, session } = createWorld({ members: WORLD_MEMBERS })
    const keys = new Set()
    for (const id of ['stu-a1', 'stu-a2', 'stu-a3', 'teacher-1']) {
      session.userId = id
      keys.add((await resolveAccess(null, deps)).viewer)
    }
    expect(keys.size).toBe(4)
  })

  it('fails closed when the membership source errors', async () => {
    const { deps, session } = createWorld()
    deps.membership = { resolve: async () => { throw new Error('db down') } }
    session.userId = 'stu-a1'
    await fails(resolveAccess(null, deps), 503, 'membership_unavailable')
  })

  it('ignores a malformed mapping result', async () => {
    const { deps, session } = createWorld()
    deps.membership = { resolve: async () => ({ classId: 'class-a', memberId: 'bad id with spaces', groupId: 'g1' }) }
    session.userId = 'stu-a1'
    await fails(resolveAccess(null, deps), 403, 'not_member')
  })
})

describe('shipped activation state', () => {
  it('ships with no attached class and an empty reviewed mapping, so students are denied', async () => {
    expect(ATTACHED_CLASS_IDS).toEqual([])
    expect(REVIEWED_MEMBERS).toEqual([])
    expect(await activeMembership.resolve({ userId: 'anyone' })).toBeNull()
    expect(await denyAllMembership.resolve({ userId: 'anyone' })).toBeNull()
  })

  it('validates registry entries strictly', () => {
    expect(() => createReviewedRegistryMembership([{ userId: 'x', classId: 'class-a', memberId: 'm' }])).toThrow(/reviewed/)
    expect(() => createReviewedRegistryMembership([reviewed('x', 'class a', null)])).toThrow(/classId/)
    expect(() => createReviewedRegistryMembership([reviewed('x', 'class-a', null), reviewed('x', 'class-a', null)])).toThrow(/Duplicate/)
    expect(() => createReviewedRegistryMembership([{ ...reviewed('x', 'class-a', null), role: 'admin' }])).toThrow(/Unexpected/)
  })
})

describe('page access gate', () => {
  it('returns a neutral denial for signed-out and non-member users and ok for teacher/student', async () => {
    const { deps, session } = createWorld({ members: WORLD_MEMBERS })
    expect(await getPageAccess(deps)).toMatchObject({ ok: false, status: 401 })
    session.userId = 'stranger'
    expect(await getPageAccess(deps)).toMatchObject({ ok: false, status: 403, code: 'not_member' })
    session.userId = 'stu-a1'
    const student = await getPageAccess(deps)
    expect(student).toMatchObject({ ok: true, role: 'student', classIds: null })
    session.userId = 'teacher-1'
    expect(await getPageAccess(deps)).toMatchObject({ ok: true, role: 'teacher', classIds: ['class-a'] })
  })

  it('reports an unexpected error as unavailable and never as ok', async () => {
    const { deps } = createWorld()
    deps.isAdmin = async () => { throw new Error('boom') }
    deps.authenticate = async () => 'someone'
    expect(await getPageAccess(deps)).toMatchObject({ ok: false, status: 503 })
  })
})
