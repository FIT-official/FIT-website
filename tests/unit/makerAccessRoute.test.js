// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ maintenance: vi.fn(), getUser: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({
    clerkMiddleware: handler => handler,
    createRouteMatcher: patterns => req => patterns.some(pattern => new RegExp(`^${pattern}$`).test(new URL(req.url).pathname)),
    clerkClient: async () => ({ users: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/maintenance/middleware', () => ({ maintenanceResponse: mocks.maintenance }))
vi.mock('@/lib/blog/unlistedRobots', () => ({ isUnlistedBlogPath: async () => false }))
import middleware from '@/middleware'

beforeEach(() => { vi.clearAllMocks(); mocks.maintenance.mockResolvedValue(null) })

describe('MakerAccess access', () => {
    it.each(['/about/makeraccess', '/about/makeraccess/'])('allows %s without account or onboarding lookup', async path => {
        const auth = vi.fn().mockRejectedValue(new Error('Account lookup must not run'))
        const response = await middleware(auth, new NextRequest(`https://www.fixitoday.com${path}`))
        expect(response.status).toBe(200)
        expect(auth).not.toHaveBeenCalled()
        expect(mocks.getUser).not.toHaveBeenCalled()
    })

    it('retains the shared maintenance gate', async () => {
        mocks.maintenance.mockResolvedValue(new NextResponse('Maintenance', { status: 503 }))
        const response = await middleware(vi.fn(), new NextRequest('https://www.fixitoday.com/about/makeraccess'))
        expect(response.status).toBe(503)
    })

    it('does not broaden the public exception to neighbouring paths', async () => {
        const auth = vi.fn().mockResolvedValue({ userId: 'customer', sessionClaims: { metadata: { onboardingComplete: false } } })
        mocks.getUser.mockResolvedValue({ publicMetadata: { onboardingComplete: false } })
        const response = await middleware(auth, new NextRequest('https://www.fixitoday.com/about/makeraccess-private'))
        expect(new URL(response.headers.get('location')).pathname).toBe('/onboarding')
    })
})
