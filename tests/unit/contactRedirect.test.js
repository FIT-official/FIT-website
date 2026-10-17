// @vitest-environment node
import { AsyncLocalStorage } from 'node:async_hooks'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import config from '../../next.config.mjs'

let unstable_getResponseFromNextConfig
beforeAll(async () => {
  vi.stubGlobal('AsyncLocalStorage', AsyncLocalStorage)
  ;({ unstable_getResponseFromNextConfig } = await import('next/experimental/testing/server'))
})
afterAll(() => vi.unstubAllGlobals())

describe('/contact redirect', () => {
  it('is a permanent config redirect to the printer-repair request form', async () => {
    const redirects = await config.redirects()
    expect(redirects.filter(rule => rule.source === '/contact')).toEqual([{ source: '/contact', destination: '/printer-repair', statusCode: 301 }])
  })

  it.each(['/contact', '/contact/'])('%s answers 30x with Location /printer-repair', async path => {
    const response = await unstable_getResponseFromNextConfig({ url: `https://fit.example${path}`, nextConfig: config })
    expect(response.status).toBeGreaterThanOrEqual(300)
    expect(response.status).toBeLessThan(400)
    expect(response.headers.get('location')).toBe('https://fit.example/printer-repair')
  })

  it.each(['/contact-us', '/printer-repair'])('does not redirect %s', async path => {
    const response = await unstable_getResponseFromNextConfig({ url: `https://fit.example${path}`, nextConfig: config })
    expect(response.headers.get('location')).toBeNull()
  })
})
