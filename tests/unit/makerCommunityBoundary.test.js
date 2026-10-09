// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const state = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@clerk/nextjs/server', async () => {
  const actual = await vi.importActual('@clerk/nextjs/server')
  return { ...actual, clerkMiddleware: handler => handler,
    clerkClient: async () => ({ users: { getUser: state.getUser } }) }
})
import middleware from '@/middleware'
import { SITEMAP_PUBLIC_PATHS } from '@/lib/seo/sitemap'
beforeEach(() => { vi.clearAllMocks(); state.getUser.mockResolvedValue({ publicMetadata: {} }) })
it.each(['/maker-tools', '/maker-tools/playground', '/maker-tools/playground/', '/guides/3d-printing-problems', '/guides/3d-printing-problems/', '/community', '/community/', '/community/project-a', '/community/project-a/comments'])('leaves exact public destination %s available without account lookup', async pathname => {
  const auth = vi.fn().mockRejectedValue(Error('Account lookup must not run'))
  const result = await middleware(auth, new NextRequest('https://fit.test' + pathname))
  expect(result.status).toBe(200); expect(auth).not.toHaveBeenCalled(); expect(state.getUser).not.toHaveBeenCalled()
})
it.each(['/guides/3d-printing-problems-private', '/guides/3d-printing-problems/nested', '/maker-tools/playground-private', '/community-private', '/community-private/post', '/communities', '/maker-tools-private', '/maker-tools/nested'])('keeps unrelated route %s behind normal onboarding rules', async pathname => {
  const auth = vi.fn().mockResolvedValue({ userId: 'new-user', sessionClaims: {} })
  const result = await middleware(auth, new NextRequest('https://fit.test' + pathname))
  expect(auth).toHaveBeenCalledOnce(); expect(result.headers.get('location')).toBe('https://fit.test/onboarding')
})
it('includes only the static Community landing page in the public sitemap', () => {
  expect(SITEMAP_PUBLIC_PATHS.filter(path => path.startsWith('/community'))).toEqual(['/community'])
})
