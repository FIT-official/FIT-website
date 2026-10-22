import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createOwnerResearchDeps } from '@/lib/advancedClasses/researchAdapter'
import { BINDINGS, FIT, PERSONAL, OTHER_ADMIN, STRANGER, directory } from './fixtures'

const accessFile = resolve(process.cwd(), 'lib/researchProjects/access.js')
const haveAdapter = existsSync(accessFile)
// Native Node import so the sibling checkout loads untransformed, exactly as it runs in production.

const base = { authenticate: async () => { throw new Error('replaced per test') } }
const deps = (dir, mode) => createOwnerResearchDeps({ baseDeps: base, bindings: BINDINGS, fetchUser: dir.fetchUser, mode })

describe('owner deps for the research project adapter (synthetic)', () => {
  it('student mode: owners get an opaque member scope, never teacher; others get nothing', async () => {
    const dir = directory()
    const d = deps(dir, 'student')
    expect(d.attachedClassIds).toEqual(['ac-synth-workspace'])
    expect(await d.isAdmin(FIT)).toBe(false)
    expect(await d.membership.resolve({ userId: FIT })).toEqual({ classId: 'ac-synth-workspace', groupId: null, memberId: 'ac-m-synth-fit', label: 'Owner' })
    expect(await d.membership.resolve({ userId: PERSONAL })).toMatchObject({ memberId: 'ac-m-synth-personal' })
    expect(await d.membership.resolve({ userId: OTHER_ADMIN })).toBeNull()
    expect(await d.membership.resolve({ userId: STRANGER })).toBeNull()
  })

  it('teacher mode: only FIT (with live admin) is a teacher; the personal account and other admins are not', async () => {
    const dir = directory()
    const d = deps(dir, 'teacher')
    expect(await d.isAdmin(FIT)).toBe(true)
    expect(await d.isAdmin(PERSONAL)).toBe(false)
    expect(await d.isAdmin(OTHER_ADMIN)).toBe(false)
    expect(await d.membership.resolve({ userId: OTHER_ADMIN })).toBeNull()
  })

  it('shares one live provider check per user per instance', async () => {
    const dir = directory()
    const d = deps(dir, 'teacher')
    await d.isAdmin(FIT)
    await d.membership.resolve({ userId: FIT })
    expect(dir.calls).toEqual([FIT])
  })

  it('denies membership on provider failure and rejects an unknown mode', async () => {
    const d = createOwnerResearchDeps({ baseDeps: base, bindings: BINDINGS, fetchUser: async () => { throw new Error('down') } })
    expect(await d.membership.resolve({ userId: PERSONAL })).toBeNull()
    expect(() => createOwnerResearchDeps({ baseDeps: base, bindings: BINDINGS, fetchUser: async () => ({}), mode: 'admin' })).toThrow()
  })

  // Contract check against the sibling checkout's real resolveAccess (read only), run in a plain Node child
  // process because that checkout is outside this worktree's Vite root. Synthetic users only. Skipped if absent.
  it.skipIf(!haveAdapter)('feeds the real research project resolveAccess', () => {
    const script = `
      const [access, adapter] = process.argv.slice(1)
      const { resolveAccess, AccessError } = await import(access)
      const { createOwnerResearchDeps } = await import(adapter)
      const bindings = JSON.parse(process.env.BINDINGS)
      const users = JSON.parse(process.env.USERS)
      const fetchUser = async (id) => users[id]
      const out = {}
      for (const id of ['FIT', 'PERSONAL', 'OTHER_ADMIN', 'STRANGER']) for (const mode of ['student', 'teacher']) {
        const deps = { ...createOwnerResearchDeps({ baseDeps: {}, bindings, fetchUser, mode }), authenticate: async () => 'user_SYNTHETIC_' + id }
        try { const a = await resolveAccess(null, deps); out[id + ':' + mode] = { role: a.role, memberId: a.personal?.memberId, scope: a.personal?.scope } }
        catch (e) { out[id + ':' + mode] = e instanceof AccessError ? 'denied' : 'error' }
      }
      console.log(JSON.stringify(out))`
    const dir = directory()
    const result = JSON.parse(execFileSync(process.execPath, ['--conditions=react-server', '--no-warnings', '--input-type=module', '-e', script, pathToFileURL(accessFile).href, pathToFileURL(resolve(process.cwd(), 'lib/advancedClasses/researchAdapter.js')).href], {
      env: { ...process.env, BINDINGS: JSON.stringify(BINDINGS), USERS: JSON.stringify(dir.users) }, encoding: 'utf8',
    }))
    expect(result['PERSONAL:student']).toEqual({ role: 'student', memberId: 'ac-m-synth-personal', scope: 'member:ac-m-synth-personal' })
    expect(result['FIT:student']).toMatchObject({ role: 'student', memberId: 'ac-m-synth-fit' })
    expect(result['FIT:teacher']).toMatchObject({ role: 'teacher' })
    expect(result['PERSONAL:teacher']).toMatchObject({ role: 'student' })
    for (const id of ['OTHER_ADMIN', 'STRANGER']) for (const mode of ['student', 'teacher']) expect(result[id + ':' + mode]).toBe('denied')
  })
})
