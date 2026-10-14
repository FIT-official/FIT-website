// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../app/simulations/[activity]/route'
import { playerDocument } from '../lib/classroomSimulations/playerDocument'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: handler => handler,
  createRouteMatcher: patterns => req => patterns.some(pattern => new RegExp(`^${pattern}$`).test(new URL(req.url).pathname)),
  clerkClient: async () => ({ users: { getUser: mocks.getUser } }),
}))
let middleware, matcher, auth, flags
const request = path => new NextRequest(`https://fit.example${path}`)
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks()
  vi.stubEnv('EDGE_CONFIG', 'https://edge-config.vercel.com/ecfg_synthetic?token=synthetic-only')
  flags = { maintenance_banner: { enabled: false, message: '', startsAt: null, endsAt: null }, maintenance_page: { enabled: true, title: 'Maintenance', message: 'Back soon', until: null } }
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => flags })))
  auth = vi.fn().mockResolvedValue({ userId: null }); auth.protect = vi.fn()
  mocks.getUser.mockResolvedValue({ publicMetadata: { role: 'customer', onboardingComplete: true } })
  const middlewareModule = await import('../middleware'); middleware = middlewareModule.default; matcher = middlewareModule.config.matcher
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('Gated original player entrypoints', () => {
  it.each(['sampling', 'feedback', 'base-rates', 'heat-path'])('serves a public, uncached allowlisted %s document', async id => {
    const response = await GET(request(`/simulations/${id}`), { params: Promise.resolve({ activity: id }) })
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(html).toContain(`data-activity="${id}"`)
    expect(html).toContain('src="/simulations/lab.js"')
    expect(html).not.toContain('clerk')
    expect(existsSync(resolve(`public/simulations/${id}/index.html`))).toBe(false)
  })
  it.each(['unknown', 'sampling.html', '../account', '<script>'])('rejects unallowlisted %s identifiers', async activity => {
    expect(playerDocument(activity)).toBeNull()
    const response = await GET(request('/simulations/unknown'), { params: Promise.resolve({ activity }) })
    expect(response.status).toBe(404)
  })
  it.each(['/simulations/sampling', '/simulations/feedback', '/simulations/base-rates', '/simulations/heat-path', '/classes/simulations'])('preserves the actual maintenance gate for %s', async path => {
    expect(new RegExp(`^${matcher[0]}$`).test(path)).toBe(true)
    const response = await middleware(auth, request(path + '?embed=1'))
    expect(response.status).toBe(503)
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://fit.example/maintenance')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
  it('opens anonymously when maintenance is off, and preserves onboarding for incomplete signed-in accounts', async () => {
    flags.maintenance_page.enabled = false
    expect((await middleware(auth, request('/simulations/sampling')))?.status ?? 200).toBe(200)
    auth.mockResolvedValue({ userId: 'synthetic-incomplete', sessionClaims: { metadata: {} } })
    mocks.getUser.mockResolvedValue({ publicMetadata: { onboardingComplete: false } })
    const middlewareModule = await import('../middleware')
    const response = await middlewareModule.default(auth, request('/simulations/sampling'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://fit.example/onboarding')
  })
})
