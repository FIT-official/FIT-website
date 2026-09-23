import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), auth: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({
    clerkMiddleware: handler => handler,
    createRouteMatcher: patterns => req => patterns.some(pattern => new RegExp(`^${pattern}$`).test(new URL(req.url).pathname)),
    clerkClient: async () => ({ users: { getUser: mocks.getUser } }),
    auth: mocks.auth,
}))
vi.mock('next/navigation', () => ({ redirect: (url) => { throw new Error(`REDIRECT:${url}`) } }))
vi.mock('@/app/onboarding/Onboarding', () => ({ default: () => null }))
import middleware from '@/middleware'
import OnboardingLayout from '@/app/onboarding/layout'
import OnboardingPage from '@/app/onboarding/page'

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
        await expect(OnboardingPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/dashboard/shop')
    })
    it('preserves a paid choice through new-account onboarding and completed-account redirects', async () => {
        let response = await middleware(mocks.auth, new Request('https://fit.example/account/subscription?priceId=price_pro_year'))
        expect(response.headers.get('location')).toBe('https://fit.example/onboarding?priceId=price_pro_year')
        mocks.getUser.mockResolvedValue({ publicMetadata: { onboardingComplete: true } })
        for (const path of ['/onboarding', '/sign-up', '/sign-in']) {
            response = await middleware(mocks.auth, new Request(`https://fit.example${path}?priceId=price_pro_year`))
            expect(response.headers.get('location')).toBe('https://fit.example/account/subscription?priceId=price_pro_year')
        }
        await expect(OnboardingPage({ searchParams: Promise.resolve({ priceId: 'price_pro_year' }) })).rejects.toThrow('REDIRECT:/account/subscription?priceId=price_pro_year')
    })
    it('routes a signed-out paid checkout intent through sign-in without accepting external destinations', async () => {
        mocks.auth.mockResolvedValue({ userId: null })
        const response = await middleware(mocks.auth, new Request('https://fit.example/account/subscription?priceId=price_standard_year&redirect_url=https://evil.example'))
        expect(response.headers.get('location')).toBe('https://fit.example/sign-in?priceId=price_standard_year')
    })
    it('discards invalid intent IDs and preserves the default onboarding destination', async () => {
        const response = await middleware(mocks.auth, new Request('https://fit.example/account/subscription?priceId=https%3A%2F%2Fevil.example'))
        expect(response.headers.get('location')).toBe('https://fit.example/onboarding')
        mocks.getUser.mockResolvedValue({ publicMetadata: { onboardingComplete: true } })
        await expect(OnboardingPage({ searchParams: Promise.resolve({ priceId: ['price_one', 'price_two'] }) })).rejects.toThrow('REDIRECT:/dashboard/shop')
    })
})
