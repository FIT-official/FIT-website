// @vitest-environment node
import { webcrypto, createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isUnlistedBlogPath } from '@/lib/blog/unlistedRobots'
import { unlistedSlugHashes } from '@/lib/blog/unlistedSlugHashes'
import config from '../../next.config.mjs'

vi.mock('@clerk/nextjs/server', () => ({
    clerkMiddleware: handler => handler,
    createRouteMatcher: patterns => req => patterns.some(pattern => new RegExp(`^${pattern}$`).test(new URL(req.url).pathname)),
    clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: { onboardingComplete: false } }) } }),
}))
import { authenticatedMiddleware as middleware } from '@/middleware'

beforeEach(() => { vi.stubGlobal('crypto', webcrypto); vi.stubEnv('UNLISTED_BLOG_SLUGS', '') })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const digest = slug => createHash('sha256').update(slug).digest('hex')

describe('unlisted blog response headers', () => {
    it('matches hashes using Web Crypto, including encoded paths and trailing slashes', async () => {
        const hashes = [digest('link-guide')]
        expect(await isUnlistedBlogPath('/blog/link-guide', '', hashes)).toBe(true)
        expect(await isUnlistedBlogPath('/blog/link%2Dguide/', '', hashes)).toBe(true)
        for (const path of ['/blog', '/blog/feed.xml', '/blog/other', '/api/blog/link-guide', '/blog/link-guide/extra', '/blog/%zz']) {
            expect(await isUnlistedBlogPath(path, '', hashes)).toBe(false)
        }
    })
    it('supports a trimmed comma env list independently of the hash list', async () => {
        expect(await isUnlistedBlogPath('/blog/env-guide', ' , env-guide , second-guide ', [])).toBe(true)
        expect(await isUnlistedBlogPath('/blog/other', 'env-guide', [])).toBe(false)
    })
    it('commits only SHA-256 digests', () => {
        expect(unlistedSlugHashes.length).toBeGreaterThan(0)
        expect(unlistedSlugHashes.every(hash => /^[a-f0-9]{64}$/.test(hash))).toBe(true)
        expect(readFileSync(new URL('../../lib/blog/unlistedSlugHashes.js', import.meta.url), 'utf8')).not.toContain('/blog/')
    })
    it('sets the middleware header while preserving signed-out and onboarding behavior', async () => {
        vi.stubEnv('UNLISTED_BLOG_SLUGS', 'link-guide')
        const signedOut = vi.fn(async () => ({ userId: null }))
        let response = await middleware(signedOut, new Request('https://fit.example/blog/link-guide'))
        expect(response.status).toBe(200)
        expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
        const newAccount = vi.fn(async () => ({ userId: 'new', sessionClaims: {} }))
        response = await middleware(newAccount, new Request('https://fit.example/blog/link-guide'))
        expect(response.status).toBe(307)
        expect(response.headers.get('location')).toBe('https://fit.example/onboarding')
        expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
        response = await middleware(signedOut, new Request('https://fit.example/blog/public-guide'))
        expect(response?.headers.get('X-Robots-Tag')).toBeUndefined()
    })
    it('keeps CSP and appends only valid env header rules', async () => {
        expect(await config.headers()).toHaveLength(2)
        vi.stubEnv('UNLISTED_BLOG_SLUGS', ' , link-guide , second-guide, bad/:path*, ')
        const headers = await config.headers()
        expect(headers.filter(rule => rule.source.startsWith('/blog/') && rule.source !== '/blog/drafts/:path*')).toEqual(['link-guide', 'second-guide'].map(slug => ({
            source: `/blog/${slug}`, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
        })))
        expect(headers.find(rule => rule.source === '/(.*)').headers[0].key).toBe('Content-Security-Policy')
    })
})
