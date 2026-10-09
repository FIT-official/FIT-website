// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatSgtWindow, isBannerActive, isPageActive } from '@/lib/maintenance/config'

const items = {
    maintenance_banner: { enabled: true, message: 'Work tonight', startsAt: '2026-10-10T02:00:00+08:00', endsAt: '2026-10-10T03:00:00+08:00' },
    maintenance_page: { enabled: true, title: 'Back soon', message: 'Work in progress', until: null },
}

beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('EDGE_CONFIG', 'https://edge-config.vercel.com/ecfg_example?token=test-only-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => items }))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('active maintenance windows', () => {
    it('announces upcoming work immediately and stops exactly at the end', () => {
        expect(isBannerActive(items.maintenance_banner, Date.parse('2026-10-09T12:00:00Z'))).toBe(true)
        expect(isBannerActive(items.maintenance_banner, Date.parse('2026-10-09T19:00:00Z'))).toBe(false)
        expect(isBannerActive({ enabled: true, endsAt: null })).toBe(true)
        expect(isBannerActive({ ...items.maintenance_banner, enabled: false }, 0)).toBe(false)
    })
    it('expires the page precisely and treats invalid input as inactive', () => {
        const until = '2026-10-10T03:00:00+08:00'
        expect(isPageActive({ enabled: true, until }, Date.parse(until) - 1)).toBe(true)
        expect(isPageActive({ enabled: true, until }, Date.parse(until))).toBe(false)
        for (const cfg of [null, {}, { enabled: 'true', until: null }, { enabled: true, until: 'bad' }, { enabled: false, until: null }]) {
            expect(isPageActive(cfg)).toBe(false)
            expect(isBannerActive(cfg)).toBe(false)
        }
        expect(isPageActive(items.maintenance_page)).toBe(true)
    })
    it.each([
        ['2026-10-09T18:00:00Z', '2026-10-09T19:00:00Z', 'Sat 10 Oct, 02:00–03:00 SGT'],
        ['2026-10-10T23:30:00+08:00', '2026-10-11T00:30:00+08:00', 'Sat 10 Oct, 23:30–Sun 11 Oct, 00:30 SGT'],
        ['2026-12-31T23:30:00+08:00', '2027-01-01T00:30:00+08:00', 'Thu 31 Dec 2026, 23:30–Fri 01 Jan 2027, 00:30 SGT'],
        [null, '2026-10-10T03:00:00+08:00', 'Until Sat 10 Oct, 03:00 SGT'],
        ['2026-10-10T03:00:00+08:00', null, 'Sat 10 Oct, 03:00 SGT'],
        ['invalid', null, ''],
    ])('formats %s to %s in Singapore time', (start, end, expected) => {
        expect(formatSgtWindow(start, end)).toBe(expected)
    })
})

describe('Edge Config availability', () => {
    it('uses the items endpoint, shares simultaneous reads and refreshes after ten seconds', async () => {
        vi.useFakeTimers()
        const { readMaintenanceConfig } = await import('@/lib/maintenance/config')
        const [a, b] = await Promise.all([readMaintenanceConfig(), readMaintenanceConfig()])
        expect(a).toEqual({ banner: items.maintenance_banner, page: items.maintenance_page })
        expect(b).toEqual(a)
        expect(fetch).toHaveBeenCalledOnce()
        const [url, options] = fetch.mock.calls[0]
        expect(url.toString()).toBe('https://edge-config.vercel.com/ecfg_example/items?token=test-only-token')
        expect(options.cache).toBe('no-store')
        expect(options.redirect).toBe('error')
        await vi.advanceTimersByTimeAsync(9_999)
        await readMaintenanceConfig()
        expect(fetch).toHaveBeenCalledOnce()
        await vi.advanceTimersByTimeAsync(1)
        fetch.mockRejectedValue(new Error('private token must not escape'))
        const cfg = await readMaintenanceConfig()
        expect(cfg.page.enabled).toBe(false)
        expect(cfg.banner.enabled).toBe(false)
        expect(fetch).toHaveBeenCalledTimes(2)
        await readMaintenanceConfig()
        expect(fetch).toHaveBeenCalledTimes(2)
    })
    it.each(['', 'bad-url', 'https://other.example/ecfg_example?token=test-only-token', 'https://edge-config.vercel.com/ecfg_example'])('keeps missing or invalid connection strings off', async source => {
        vi.stubEnv('EDGE_CONFIG', source)
        const { readMaintenanceConfig } = await import('@/lib/maintenance/config')
        const cfg = await readMaintenanceConfig()
        expect(cfg.page.enabled).toBe(false)
        expect(cfg.banner.enabled).toBe(false)
        expect(fetch).not.toHaveBeenCalled()
    })
    it.each(['network', 'status', 'json', 'missing-item', 'bad-date'])('fails open on %s without exposing details', async kind => {
        const error = new Error('test-only-token')
        if (kind === 'network') fetch.mockRejectedValue(error)
        if (kind === 'status') fetch.mockResolvedValue({ ok: false })
        if (kind === 'json') fetch.mockResolvedValue({ ok: true, json: async () => { throw error } })
        if (kind === 'missing-item') fetch.mockResolvedValue({ ok: true, json: async () => ({ maintenance_page: items.maintenance_page }) })
        if (kind === 'bad-date') fetch.mockResolvedValue({ ok: true, json: async () => ({ ...items, maintenance_page: { ...items.maintenance_page, until: 'invalid' } }) })
        const log = vi.spyOn(console, 'error')
        const { readMaintenanceConfig } = await import('@/lib/maintenance/config')
        const cfg = await readMaintenanceConfig()
        expect(cfg.banner.enabled).toBe(false)
        expect(cfg.page.enabled).toBe(false)
        expect(JSON.stringify(cfg)).not.toContain('test-only-token')
        expect(log).not.toHaveBeenCalled()
        log.mockRestore()
    })
    it.each(['fetch', 'body'])('bounds a hanging %s read to 1.5 seconds', async stage => {
        vi.useFakeTimers()
        const never = new Promise(() => {})
        fetch.mockImplementation(() => stage === 'fetch' ? never : Promise.resolve({ ok: true, json: () => never }))
        const { readMaintenanceConfig } = await import('@/lib/maintenance/config')
        const result = readMaintenanceConfig()
        await vi.advanceTimersByTimeAsync(1_500)
        expect((await result).page.enabled).toBe(false)
        expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
    })
})
