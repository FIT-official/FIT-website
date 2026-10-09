// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import config from '../../next.config.mjs'

afterEach(() => vi.unstubAllEnvs())
const headers = async () => Object.fromEntries((await config.headers()).find(rule => rule.source === '/(.*)').headers.map(header => [header.key, header.value]))

it('sets security headers globally and disables the Next.js signature', async () => {
    expect(config.poweredByHeader).toBe(false)
    expect(await headers()).toMatchObject({
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com" "https://pay.google.com")',
    })
})
it('keeps enforcement limited to the original frame policies', async () => {
    const value = (await headers())['Content-Security-Policy']
    expect(value).toBe("frame-ancestors 'self' https://pay.google.com; frame-src 'self' https://pay.google.com https://js.stripe.com https://challenges.cloudflare.com https://www.google.com/shopping/customerreviews/optin; ")
})
it('reports the full CSP without enforcing script, image or connection restrictions', async () => {
    const value = (await headers())['Content-Security-Policy-Report-Only']
    const directives = Object.fromEntries(value.split(';').map(part => part.trim().split(/\s+/)).filter(parts => parts[0]).map(([name, ...sources]) => [name, sources]))
    expect(directives['default-src']).toEqual(["'self'"])
    expect(directives['script-src']).toEqual(expect.arrayContaining([
        "'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://*.clerk.accounts.dev', 'https://clerk.fixitoday.com', 'https://*.clerk.com',
        'https://js.stripe.com', 'https://us.i.posthog.com', 'https://us-assets.i.posthog.com', 'https://pay.google.com',
        'https://www.googletagmanager.com', 'https://www.google-analytics.com', 'https://www.google.com', 'https://www.gstatic.com', 'https://challenges.cloudflare.com',
    ]))
    expect(directives['img-src']).toEqual(["'self'", 'data:', 'blob:', 'https:'])
    expect(directives['connect-src']).toEqual(["'self'", 'https:', 'wss:'])
    expect(directives['frame-ancestors']).toEqual(["'self'", 'https://pay.google.com'])
    expect(directives['frame-src']).toEqual(["'self'", 'https://pay.google.com', 'https://js.stripe.com', 'https://challenges.cloudflare.com', 'https://www.google.com/shopping/customerreviews/optin'])
    expect(directives['object-src']).toEqual(["'none'"])
    expect(directives['base-uri']).toEqual(["'self'"])
})
it('preserves unlisted noindex rules and does not configure wildcard cart CORS', async () => {
    vi.stubEnv('UNLISTED_BLOG_SLUGS', 'existing-guide')
    const rules = await config.headers()
    expect(rules).toContainEqual({ source: '/blog/existing-guide', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] })
    expect(rules.flatMap(rule => rule.headers)).not.toContainEqual({ key: 'Access-Control-Allow-Origin', value: '*' })
})
