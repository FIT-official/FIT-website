// @vitest-environment node
import { AsyncLocalStorage } from 'node:async_hooks'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import config from '../../next.config.mjs'

let unstable_getResponseFromNextConfig
beforeAll(async () => {
  // Match the global installed by Next during server startup.
  vi.stubGlobal('AsyncLocalStorage', AsyncLocalStorage)
  ;({ unstable_getResponseFromNextConfig } = await import('next/experimental/testing/server'))
})
afterAll(() => vi.unstubAllGlobals())

describe('Class redirects', () => {
  it('uses explicit HTTP 301 for the parent and every nested legacy route', async () => {
    const redirects = await config.redirects()
    expect(redirects.filter(rule => rule.source === '/classes' || rule.source.startsWith('/classes/'))).toEqual([
      { source: '/classes', destination: '/class', statusCode: 301 },
      { source: '/classes/:path*', destination: '/class/:path*', statusCode: 301 },
    ])
    expect(redirects.some(rule => rule.source === '/class' || rule.source.startsWith('/class/'))).toBe(false)
    expect(redirects).toContainEqual({
      source: '/products/esp32-wroomdevkit-30pin-2',
      destination: '/products/esp32-wroomdevkit-30pin',
      permanent: true,
    })
  })

  it.each([
    ['/classes', '/class'],
    ['/classes/', '/class'],
    ['/classes/simulations', '/class/simulations'],
    ['/classes/simulations/sampling', '/class/simulations/sampling'],
    ['/classes/simulations/ratio-paint-mix?level=2', '/class/simulations/ratio-paint-mix?level=2'],
  ])('redirects %s to %s with HTTP 301 through the Next router', async (source, destination) => {
    const response = await unstable_getResponseFromNextConfig({ url: `https://fit.example${source}`, nextConfig: config })
    expect(response.status).toBe(301)
    expect(response.headers.get('location')).toBe(`https://fit.example${destination}`)
  })

  it.each(['/class', '/class/simulations', '/class/simulations/sampling', '/classes-extra', '/workshop/classroom', '/embed/sims/sampling'])('does not redirect %s', async path => {
    const response = await unstable_getResponseFromNextConfig({ url: `https://fit.example${path}`, nextConfig: config })
    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })
})
