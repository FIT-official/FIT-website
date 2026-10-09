// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeHomeFlag, shouldRenderHomeV2, HOME_SECTIONS } from '@/lib/home/flags'

beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('EDGE_CONFIG', 'https://edge-config.vercel.com/ecfg_example?token=test-only-token')
    vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('home version selection', () => {
    it.each([
        [undefined, undefined, false], [{}, { enabled: false }, false], [{}, { enabled: true }, true],
        [{ home: 'v2' }, { enabled: false }, true], [{ home: 'v1' }, { enabled: true }, false],
        [{ home: ['v2', 'v1'] }, { enabled: true }, false], [{ home: 'unknown' }, null, false],
        [{}, { enabled: 'true' }, false],
    ])('selects the correct home for %j and %j', (params, flag, expected) => {
        expect(shouldRenderHomeV2(params, flag)).toBe(expected)
    })
    it('defaults built sections on and only explicit false hides a known section', () => {
        const flag = normalizeHomeFlag({ enabled: true, sections: { bulk: false, faq: true, hero: 'false', unknown: false } })
        expect(flag.sections.bulk).toBe(false)
        expect(flag.sections.faq).toBe(true)
        expect(flag.sections.hero).toBe(true)
        expect(Object.keys(flag.sections)).toEqual(HOME_SECTIONS)
        expect(Object.values(normalizeHomeFlag(null).sections).every(Boolean)).toBe(true)
    })
})

describe('shared Edge Config home flag', () => {
    it('reads home independently of maintenance items', async () => {
        fetch.mockResolvedValue({ ok: true, json: async () => ({ home_v2: { enabled: true, sections: { shop: false } } }) })
        const { readHomeFlag } = await import('@/lib/home/flags')
        expect(await readHomeFlag()).toMatchObject({ enabled: true, sections: { shop: false, bulk: true } })
    })
    it('shares one fetch with maintenance without leaking raw items', async () => {
        const banner = { enabled: true, message: 'Notice', startsAt: null, endsAt: null }
        const page = { enabled: false, title: '', message: '', until: null }
        fetch.mockResolvedValue({ ok: true, json: async () => ({ maintenance_banner: banner, maintenance_page: page, home_v2: { enabled: true }, unrelated: 'private' }) })
        const { readMaintenanceConfig } = await import('@/lib/maintenance/config')
        const { readHomeFlag } = await import('@/lib/home/flags')
        const [maintenance, home] = await Promise.all([readMaintenanceConfig(), readHomeFlag()])
        expect(maintenance).toEqual({ banner, page })
        expect(home.enabled).toBe(true)
        expect(home).not.toHaveProperty('unrelated')
        expect(fetch).toHaveBeenCalledOnce()
    })
    it.each(['missing', 'malformed', 'network', 'http', 'json', 'source'])('keeps v2 off after %s', async kind => {
        fetch.mockResolvedValue({ ok: true, json: async () => kind === 'malformed' ? { home_v2: { enabled: 'true' } } : {} })
        if (kind === 'network') fetch.mockRejectedValue(new Error('test failure'))
        if (kind === 'http') fetch.mockResolvedValue({ ok: false, status: 500 })
        if (kind === 'json') fetch.mockResolvedValue({ ok: true, json: async () => { throw Error('bad JSON') } })
        if (kind === 'source') vi.stubEnv('EDGE_CONFIG', '')
        const { readHomeFlag } = await import('@/lib/home/flags')
        expect((await readHomeFlag()).enabled).toBe(false)
    })
    it.each(['fetch', 'body'])('times out a hanging %s and keeps v2 off', async stage => {
        vi.useFakeTimers()
        const never = new Promise(() => {})
        fetch.mockResolvedValue(stage === 'fetch' ? never : { ok: true, json: () => never })
        const { readHomeFlag } = await import('@/lib/home/flags')
        const result = readHomeFlag()
        await vi.advanceTimersByTimeAsync(1500)
        expect((await result).enabled).toBe(false)
    })
    it('expires an enabled flag and fails off instead of retaining stale ON', async () => {
        vi.useFakeTimers()
        fetch.mockResolvedValue({ ok: true, json: async () => ({ home_v2: { enabled: true } }) })
        const { readHomeFlag } = await import('@/lib/home/flags')
        expect((await readHomeFlag()).enabled).toBe(true)
        await vi.advanceTimersByTimeAsync(10000)
        fetch.mockRejectedValue(Error('offline'))
        expect((await readHomeFlag()).enabled).toBe(false)
    })
})
