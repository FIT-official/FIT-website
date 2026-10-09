// @vitest-environment node
import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({
    clerkMiddleware: handler => handler,
    createRouteMatcher: patterns => req => patterns.some(pattern => new RegExp(`^${pattern}$`).test(new URL(req.url).pathname)),
    clerkClient: async () => ({ users: { getUser: mocks.getUser } }),
}))

// Synthetic test value; no real deployment environment is loaded.
const secret = 'synthetic-maintenance-test-value'
const signature = createHmac('sha256', secret).update('fit-maintenance-bypass-v1').digest('hex')
const flags = {
    maintenance_banner: { enabled: false, message: '', startsAt: null, endsAt: null },
    maintenance_page: { enabled: true, title: 'Maintenance', message: 'Back soon', until: null },
}
let middleware
let matcher
let auth
const request = (path, cookie) => new NextRequest(`https://fit.example${path}`, { headers: cookie ? { cookie: `fit_mbypass=${cookie}` } : {} })

beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('EDGE_CONFIG', 'https://edge-config.vercel.com/ecfg_example?token=test-only-token')
    vi.stubEnv('MAINTENANCE_BYPASS_SECRET', secret)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => flags }))
    mocks.getUser.mockResolvedValue({ publicMetadata: { role: 'customer', onboardingComplete: true } })
    auth = vi.fn().mockResolvedValue({ userId: null })
    auth.protect = vi.fn()
    const middlewareModule = await import('@/middleware')
    middleware = middlewareModule.default
    matcher = middlewareModule.config
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('maintenance routing', () => {
    it.each(['/', '/shop', '/products/part', '/blog/post', '/creators/Ada'])('rewrites %s with a real 503 and retry/cache/robots headers', async path => {
        expect(new RegExp(`^${matcher.matcher[0]}$`).test(path)).toBe(true)
        const response = await middleware(auth, request(path))
        expect(response.status).toBe(503)
        expect(response.headers.get('x-middleware-rewrite')).toBe('https://fit.example/maintenance')
        expect(response.headers.get('Retry-After')).toBe('1800')
        expect(response.headers.get('Cache-Control')).toBe('no-store')
        expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
    })
    it.each(['/api/stripe/webhook', '/api/webhook/payment', '/api/cron/x', '/api/health', '/trpc/x'])('leaves %s before flag or account work', async path => {
        expect((await middleware(auth, request(path))).status).toBe(200)
        expect(fetch).not.toHaveBeenCalled()
        expect(auth).not.toHaveBeenCalled()
    })
    it.each(['/admin', '/admin/products', '/sign-in', '/sign-up', '/sign-in/sso-callback', '/maintenance', '/_next/static/x.js', '/photo.avif', '/robots.txt', '/sitemap.xml', '/sitemap-0.xml'])('exempts %s and preserves the existing page routing', async path => {
        if (path.startsWith('/admin')) auth.mockResolvedValue({ userId: 'admin', sessionClaims: { metadata: { onboardingComplete: true } } })
        const response = await middleware(auth, request(path))
        expect(response?.status ?? 200).toBe(200)
        expect(response?.headers.get('x-middleware-rewrite') ?? null).toBeNull()
        expect(fetch).not.toHaveBeenCalled()
    })
    it('does not exempt similarly named public pages', async () => {
        for (const path of ['/administer', '/maintenance-extra', '/sign-invent']) expect((await middleware(auth, request(path))).status).toBe(503)
    })
    it('uses the remaining whole seconds and opens automatically at expiry', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-10-10T02:00:00+08:00'))
        fetch.mockResolvedValue({ ok: true, json: async () => ({ ...flags, maintenance_page: { ...flags.maintenance_page, until: '2026-10-10T03:00:00+08:00' } }) })
        expect((await middleware(auth, request('/shop'))).headers.get('Retry-After')).toBe('3600')
        await vi.advanceTimersByTimeAsync(3_600_000)
        expect((await middleware(auth, request('/shop'))).status).toBe(200)
    })
    it('fails open when the flag fetch fails without calling Clerk for a shop page', async () => {
        fetch.mockRejectedValue(new Error('test-only-token'))
        expect((await middleware(auth, request('/shop'))).status).toBe(200)
        expect(auth).not.toHaveBeenCalled()
    })
})

describe('maintenance bypass', () => {
    it('removes every secret parameter, preserves other query values and issues an HMAC cookie', async () => {
        const response = await middleware(auth, request(`/shop?category=parts&maintenance_bypass=${secret}&maintenance_bypass=duplicate`))
        expect(response.status).toBe(307)
        expect(response.headers.get('location')).toBe('https://fit.example/shop?category=parts')
        const cookie = response.cookies.get('fit_mbypass')
        expect(cookie.value).toBe(signature)
        expect(cookie.value).not.toBe(secret)
        expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 43200 })
        expect(response.headers.get('Cache-Control')).toBe('no-store')
        expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
        expect(JSON.stringify([...response.headers])).not.toContain(secret)
    })
    it('allows a valid cookie, including with a wrong param, without an account lookup', async () => {
        expect((await middleware(auth, request('/shop', signature))).status).toBe(200)
        expect((await middleware(auth, request('/shop?maintenance_bypass=wrong', signature))).status).toBe(200)
        expect(auth).not.toHaveBeenCalled()
    })
    it.each(['wrong', '', `${secret}x`])('blocks an invalid secret parameter (%s) with no hint', async value => {
        const response = await middleware(auth, request(`/?maintenance_bypass=${value}`))
        expect(response.status).toBe(503)
        expect(response.headers.get('set-cookie')).toBeNull()
        expect(response.headers.get('x-middleware-rewrite')).toBe('https://fit.example/maintenance')
    })
    it('rejects tampered, raw-secret and rotated cookies', async () => {
        for (const cookie of [secret, signature.slice(0, -1) + 'x', 'wrong']) expect((await middleware(auth, request('/shop', cookie))).status).toBe(503)
        vi.stubEnv('MAINTENANCE_BYPASS_SECRET', 'rotated-synthetic-value')
        expect((await middleware(auth, request('/shop', signature))).status).toBe(503)
        vi.stubEnv('MAINTENANCE_BYPASS_SECRET', '')
        expect((await middleware(auth, request('/shop', signature))).status).toBe(503)
    })
    it('allows the existing admin role in signed claims', async () => {
        auth.mockResolvedValue({ userId: 'owner', sessionClaims: { metadata: { role: 'admin', onboardingComplete: true } } })
        expect((await middleware(auth, request('/shop'))).status).toBe(200)
        expect(mocks.getUser).not.toHaveBeenCalled()
    })
    it('uses a cached authoritative admin lookup when role claims are absent', async () => {
        vi.useFakeTimers()
        auth.mockResolvedValue({ userId: 'owner', sessionClaims: {} })
        mocks.getUser.mockResolvedValue({ publicMetadata: { role: 'admin' } })
        expect((await middleware(auth, request('/shop'))).status).toBe(200)
        expect((await middleware(auth, request('/shop'))).status).toBe(200)
        expect(mocks.getUser).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(10_000)
        mocks.getUser.mockResolvedValue({ publicMetadata: { role: 'customer' } })
        expect((await middleware(auth, request('/shop'))).status).toBe(503)
        expect(mocks.getUser).toHaveBeenCalledTimes(2)
    })
    it('does not grant bypass to a signed-in non-admin or unverified lookup', async () => {
        auth.mockResolvedValue({ userId: 'customer', sessionClaims: { metadata: { role: 'customer' } } })
        expect((await middleware(auth, request('/shop'))).status).toBe(503)
        auth.mockResolvedValue({ userId: 'missing-claims' })
        mocks.getUser.mockRejectedValue(new Error('Clerk unavailable'))
        expect((await middleware(auth, request('/shop'))).status).toBe(503)
    })
})
