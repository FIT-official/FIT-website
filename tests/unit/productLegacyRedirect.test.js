// @vitest-environment node
import { AsyncLocalStorage } from 'node:async_hooks'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

let unstable_getResponseFromNextConfig
beforeAll(async () => {
    // Next installs this global during server startup; the isolated runner does not.
    vi.stubGlobal('AsyncLocalStorage', AsyncLocalStorage)
    ;({ unstable_getResponseFromNextConfig } = await import('next/experimental/testing/server'))
})
afterAll(() => vi.unstubAllGlobals())
import nextConfig from '../../next.config.mjs'

const origin = 'https://www.fixitoday.com'
const oldPath = '/products/bambu-lab-3d-printing-filament-1kg-pva-support'
const destination = '/products/bambu-lab-3d-printing-filament-05kg-pva-support'
const route = path => unstable_getResponseFromNextConfig({ url: origin + path, nextConfig })

describe('legacy PVA product URL continuity', () => {
    it.each(['', '?ref=legacy-catalogue', '/'])('permanently redirects the old URL %s to the corrected product', async suffix => {
        const response = await route(oldPath + suffix)
        expect(response.status).toBe(308)
        expect(response.headers.get('location')).toBe(origin + destination + (suffix.startsWith('?') ? suffix : ''))
    })
    it('does not redirect the destination or unrelated product paths', async () => {
        for (const path of [destination, `${destination}?ref=legacy-catalogue`, oldPath + '-2', oldPath + '/unrelated', '/products/lanbo-pla']) {
            const response = await route(path)
            expect(response.headers.get('location')).toBeNull()
        }
    })
    it('retains the existing unrelated product redirect', async () => {
        const response = await route('/products/esp32-wroomdevkit-30pin-2')
        expect(response.status).toBe(308)
        expect(response.headers.get('location')).toBe(origin + '/products/esp32-wroomdevkit-30pin')
    })
    it('has no duplicate sources or redirect cycles', async () => {
        const redirects = await nextConfig.redirects()
        const routes = new Map(redirects.map(({ source, destination }) => [source, destination]))
        expect(routes.size).toBe(redirects.length)
        for (const { source } of redirects) {
            const seen = new Set()
            let path = source
            while (routes.has(path)) {
                expect(seen.has(path), `Redirect cycle at ${path}`).toBe(false)
                seen.add(path)
                path = routes.get(path)
            }
        }
    })
})
