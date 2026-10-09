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
    it.each(['/admin', '/admin/products', '/dashboard', '/account'])('protects signed-out %s through the same Clerk sign-in redirect', async path => {
        const redirect = new Error('CLERK_SIGN_IN_REDIRECT')
        const auth = vi.fn().mockResolvedValue({ userId: null })
        auth.protect = vi.fn().mockRejectedValue(redirect)
        await expect(middleware(auth, new Request(`https://fit.example${path}`))).rejects.toBe(redirect)
        expect(auth.protect).toHaveBeenCalledOnce()
        expect(mocks.getUser).not.toHaveBeenCalled()
    })
    it('lets a signed-in, onboarded admin request reach the page authorization check', async () => {
        mocks.auth.mockResolvedValue({ userId: 'admin', sessionClaims: { metadata: { onboardingComplete: true } } })
        const response = await middleware(mocks.auth, new Request('https://fit.example/admin'))
        expect(response.status).toBe(200)
        expect(response.headers.get('location')).toBeNull()
    })
    it('leaves admin API authorization with its handlers', async () => {
        const response = await middleware(mocks.auth, new Request('https://fit.example/api/admin/settings'))
        expect(response.status).toBe(200)
        expect(mocks.auth).not.toHaveBeenCalled()
    })
    it.each(['/shop', '/products/1kg-pla-3d-printing-filament-lanbo', '/cart', '/checkout', '/checkout/return', '/research-fabrication', '/metal-fabrication', '/3d-design-printing', '/electronics-prototyping', '/printer-repair'])('keeps %s public without depending on Clerk account lookup', async path => {
        const auth = vi.fn().mockRejectedValue(new Error('Clerk unavailable'))
        auth.protect = vi.fn()
        const response = await middleware(auth, new Request(`https://fit.example${path}`))
        expect(response.status).toBe(200)
        expect(auth).not.toHaveBeenCalled()
        expect(auth.protect).not.toHaveBeenCalled()
    })
    it.each([null, 'user_new'])('preserves the saved repair URL for customer %s without onboarding', async userId => {
        const auth = vi.fn().mockResolvedValue({ userId, sessionClaims: { metadata: { onboardingComplete: false } } })
        auth.protect = vi.fn()
        const url = 'https://fit.example/printer-repair?request=12345678-1234-4234-8234-123456789abc'
        const request = new Request(url)
        const response = await middleware(auth, request)
        expect(response.status).toBe(200)
        expect(response.headers.get('location')).toBeNull()
        expect(request.url).toBe(url)
        expect(auth).not.toHaveBeenCalled()
        expect(mocks.getUser).not.toHaveBeenCalled()
        expect(auth.protect).not.toHaveBeenCalled()
    })
    it('does not extend the public repair exemption to unrelated paths', async () => {
        const response = await middleware(mocks.auth, new Request('https://fit.example/printer-repair-private'))
        expect(response.headers.get('location')).toBe('https://fit.example/onboarding')
    })
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
