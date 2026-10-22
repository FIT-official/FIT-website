import { describe, expect, it, vi } from 'vitest'
import { handleAccessGet, loadAdminAccessView, methodNotAllowed } from '@/lib/advancedClasses/adminAccess'
import { FIT, PERSONAL, OTHER_ADMIN, STRANGER, adminDeps, clerkUser, directory } from './fixtures'

const get = async (deps) => {
  const response = await handleAccessGet(deps)
  return { response, text: await response.clone().text(), json: await response.json() }
}

describe('admin access view (synthetic users)', () => {
  it('denies anonymous callers before touching bindings or the provider', async () => {
    const dir = directory()
    const { response, text } = await get(adminDeps({ unauthorised: true, fetchUser: dir.fetchUser }))
    expect(response.status).toBe(401)
    expect(dir.calls).toEqual([])
    expect(text).not.toMatch(/SYNTHETIC|example\.test|ac-m-/)
  })

  it('denies signed-in non-admins and never reveals account ids or emails', async () => {
    const dir = directory()
    const { response, text } = await get(adminDeps({ userId: STRANGER, fetchUser: dir.fetchUser }))
    expect(response.status).toBe(403)
    expect(dir.calls).toEqual([])
    expect(text).not.toMatch(/SYNTHETIC|example\.test|ac-m-/)
  })

  it('treats a failing admin check as denied', async () => {
    const dir = directory()
    const { response } = await get(adminDeps({ userId: FIT, fetchUser: dir.fetchUser, isAdmin: async () => { throw new Error('boom') } }))
    expect(response.status).toBe(403)
    expect(dir.calls).toEqual([])
  })

  it('fails closed with a generic message when authentication itself breaks', async () => {
    const deps = adminDeps({ fetchUser: directory().fetchUser })
    deps.authenticate = async () => { throw new Error('clerk exploded with secrets') }
    const { response, text } = await get(deps)
    expect(response.status).toBe(503)
    expect(text).not.toContain('secrets')
  })

  it('shows an admin the exact approved scope and live verification, with private headers', async () => {
    const dir = directory()
    const { response, json } = await get(adminDeps({ userId: OTHER_ADMIN, fetchUser: dir.fetchUser }))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex')
    expect(json.policy).toBe('view-only')
    expect(json.defaultForOthers).toBe('denied')
    expect(json.explanation).toMatch(/View only/)
    expect(json.provenance.source).toBe('Synthetic test fixture')
    const [fit, personal] = json.accounts
    expect(fit).toMatchObject({ userId: FIT, email: 'synthetic-fit@example.test', scope: { content: 'full-library', personalWork: true, review: true }, verification: { state: 'verified', liveAdminRole: true, effective: { review: true } } })
    expect(personal).toMatchObject({ userId: PERSONAL, scope: { review: false }, verification: { state: 'verified', liveAdminRole: false, effective: { review: false, personalWork: true } } })
  })

  it('reports live failures as denied without provider detail', async () => {
    const dir = directory({
      [FIT]: new Error('Clerk 502 internal-secret'),
      [PERSONAL]: clerkUser(PERSONAL, 'changed@example.test'),
    })
    const { json, text } = await get(adminDeps({ userId: OTHER_ADMIN, fetchUser: dir.fetchUser }))
    expect(json.accounts[0].verification).toMatchObject({ state: 'provider_unavailable', emailVerified: false, effective: { content: 'denied', personalWork: false, review: false } })
    expect(json.accounts[1].verification).toMatchObject({ state: 'email_mismatch', effective: { content: 'denied' } })
    expect(text).not.toContain('internal-secret')
  })

  it('shows effective review off when the FIT admin role is lost', async () => {
    const dir = directory({ [FIT]: clerkUser(FIT, 'synthetic-fit@example.test', { role: 'user' }) })
    const view = await loadAdminAccessView(adminDeps({ userId: OTHER_ADMIN, fetchUser: dir.fetchUser }))
    expect(view.body.accounts[0]).toMatchObject({ scope: { review: true }, verification: { liveAdminRole: false, effective: { review: false, personalWork: true } } })
  })

  it('maps an unexpected loader failure to a generic 503', async () => {
    const response = await handleAccessGet(async () => { throw new Error('wiring secret') })
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('secret')
  })

  it('answers write methods with 405 and no-store', async () => {
    const response = methodNotAllowed()
    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('GET')
    expect(response.headers.get('Cache-Control')).toContain('no-store')
  })

  it('never calls a mutating dependency', async () => {
    const dir = directory()
    const mutate = vi.fn()
    await loadAdminAccessView({ ...adminDeps({ userId: FIT, fetchUser: dir.fetchUser }), grant: mutate, revoke: mutate })
    expect(mutate).not.toHaveBeenCalled()
  })
})
