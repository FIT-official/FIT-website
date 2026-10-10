// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ clerk: vi.fn(), auth: vi.fn(), maintenance: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({
    clerkMiddleware: handler => (req, event) => { state.clerk(req, event); return handler(state.auth, req) },
    createRouteMatcher: patterns => req => patterns.some(pattern => new RegExp(`^${pattern}$`).test(new URL(req.url).pathname)),
    clerkClient: async () => { throw new Error('Unexpected remote user lookup') },
}))
vi.mock('@/lib/maintenance/middleware', () => ({ maintenanceResponse: state.maintenance }))
import middleware from '@/middleware'
import { DRAFT_SHELL_HEADER } from '@/lib/blog/draftAccess'

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BLOG_DRAFTS_PREVIEW', '')
    state.auth.mockResolvedValue({ userId: null })
    state.maintenance.mockResolvedValue(null)
})
afterEach(() => vi.unstubAllEnvs())
const request = path => new NextRequest(`http://localhost${path}`, { headers: { [DRAFT_SHELL_HEADER]: 'forged', accept: 'text/html' } })

describe('draft request isolation', () => {
    it.each(['/blog/drafts', '/blog/drafts/', '/blog/drafts/example'])('forwards %s in preview without Clerk, maintenance, or service calls', async path => {
        vi.stubEnv('VERCEL_ENV', 'preview')
        const response = await middleware(request(path))
        expect(response.status).toBe(200)
        expect(response.headers.get(`x-middleware-request-${DRAFT_SHELL_HEADER}`)).toBe('1')
        expect(response.headers.get('x-middleware-request-accept')).toBe('text/html')
        expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
        expect(response.headers.get('Cache-Control')).toBe('private, no-store')
        expect(state.clerk).not.toHaveBeenCalled()
        expect(state.maintenance).not.toHaveBeenCalled()
        expect(state.auth).not.toHaveBeenCalled()
    })
    it('uses Clerk only to establish production auth, leaving the admin decision to the page', async () => {
        vi.stubEnv('BLOG_DRAFTS_PREVIEW', '1')
        expect((await middleware(request('/blog/drafts'))).status).toBe(200)
        expect(state.clerk).toHaveBeenCalledOnce()
        expect(state.maintenance).not.toHaveBeenCalled()
        expect(state.auth).not.toHaveBeenCalled()
    })
    it('permits the local opt-in without Clerk', async () => {
        vi.stubEnv('NODE_ENV', 'development')
        vi.stubEnv('BLOG_DRAFTS_PREVIEW', '1')
        await middleware(request('/blog/drafts'))
        expect(state.clerk).not.toHaveBeenCalled()
    })
    it.each(['/blog', '/blog/drafts-extra', '/shop', '/api/blog'])('never selects the draft shell for %s or a spoofed marker', async path => {
        vi.stubEnv('VERCEL_ENV', 'preview')
        const response = await middleware(request(path))
        expect(response.headers.get(`x-middleware-request-${DRAFT_SHELL_HEADER}`)).toBe('0')
        expect(state.clerk).toHaveBeenCalledOnce()
    })
    it('preserves existing request overrides and response cookies', async () => {
        const response = NextResponse.next({ request: { headers: new Headers({ 'x-existing': 'verified' }) } })
        response.cookies.set('existing', 'value')
        state.maintenance.mockResolvedValue(response)
        const result = await middleware(request('/blog'))
        expect(result.headers.get('x-middleware-request-x-existing')).toBe('verified')
        expect(result.headers.get('x-middleware-override-headers').split(',')).toEqual(['x-existing', DRAFT_SHELL_HEADER])
        expect(result.cookies.get('existing').value).toBe('value')
    })
})
