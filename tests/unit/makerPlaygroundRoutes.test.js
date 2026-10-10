import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: handler => handler,
  createRouteMatcher: patterns => req => patterns.some(pattern => new RegExp(`^${pattern}$`).test(new URL(req.url).pathname)),
  clerkClient: async () => ({ users: { getUser: mocks.getUser } }),
}))
import { authenticatedMiddleware as middleware } from '@/middleware'
beforeEach(() => vi.clearAllMocks())
it.each(['/maker-tools/playground', '/maker-tools/playground/', '/maker-tools/playground?lesson=blink'])('keeps the exact local editor public for signed-in or anonymous visitors: %s', async path => {
  const auth = vi.fn().mockRejectedValue(new Error('Account lookup must not happen'))
  expect((await middleware(auth, new Request(`https://fit.example${path}`))).status).toBe(200)
  expect(auth).not.toHaveBeenCalled()
  expect(mocks.getUser).not.toHaveBeenCalled()
})
it.each(['/dashboard', '/maker-tools/playground-private', '/maker-tools/playground/admin'])('does not broaden the public exemption: %s', async path => {
  const auth = vi.fn().mockResolvedValue({ userId: 'new_customer', sessionClaims: {} })
  mocks.getUser.mockResolvedValue({ publicMetadata: {} })
  expect((await middleware(auth, new Request(`https://fit.example${path}`))).headers.get('location')).toBe('https://fit.example/onboarding')
})
