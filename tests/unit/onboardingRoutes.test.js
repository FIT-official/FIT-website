import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), auth: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({
    clerkMiddleware: handler => handler,
    createRouteMatcher: patterns => req => patterns.some(pattern => new RegExp(`^${pattern}$`).test(new URL(req.url).pathname)),
    clerkClient: async () => ({ users: { getUser: mocks.getUser } }),
    auth: mocks.auth,
}))
vi.mock('next/navigation', () => ({ redirect: (url) => { throw new Error(`REDIRECT:${url}`) } }))
import middleware from '@/middleware'
import OnboardingLayout from '@/app/onboarding/layout'

beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ userId: 'user_free', sessionClaims: {} })
    mocks.getUser.mockResolvedValue({ publicMetadata: {} })
})

describe('Free onboarding routing', () => {
    it.each(['/sign-up/sso-callback', '/sign-in/sso-callback'])('allows Clerk to complete %s without redirecting', async (path) => {
        const auth = vi.fn()
        const response = await middleware(auth, new Request(`https://fit.example${path}`))
        expect(response.status).toBe(200)
        expect(auth).not.toHaveBeenCalled()
    })
    it('uses current user metadata when onboarding claims are stale or missing', async () => {
        mocks.getUser.mockResolvedValue({ publicMetadata: { onboardingComplete: true } })
        const response = await middleware(mocks.auth, new Request('https://fit.example/dashboard/shop'))
        expect(response.status).toBe(200)
        expect(response.headers.get('location')).toBeNull()
    })
    it('sends a genuinely new account to onboarding', async () => {
        const response = await middleware(mocks.auth, new Request('https://fit.example/dashboard/shop'))
        expect(response.headers.get('location')).toBe('https://fit.example/onboarding')
    })
    it('renders onboarding without requiring custom token metadata and redirects completed accounts', async () => {
        expect(await OnboardingLayout({ children: 'Welcome' })).toBeTruthy()
        mocks.getUser.mockResolvedValue({ publicMetadata: { onboardingComplete: true } })
        await expect(OnboardingLayout({ children: 'Welcome' })).rejects.toThrow('REDIRECT:/dashboard/shop')
    })
})
