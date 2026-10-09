// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('EDGE_CONFIG', 'https://edge-config.vercel.com/ecfg_example?token=test-only-token')
    vi.stubEnv('MAINTENANCE_BYPASS_SECRET', 'synthetic-bypass-value')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('returns only public status and banner fields, with bounded public caching', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
        maintenance_banner: { enabled: true, message: 'Tonight', startsAt: '2026-10-10T02:00:00+08:00', endsAt: null, token: 'test-only-token' },
        maintenance_page: { enabled: true, title: 'Private title', message: 'Private message', until: null, secret: 'synthetic-bypass-value' },
        token: 'test-only-token',
    }) }))
    const { GET } = await import('@/app/api/maintenance/status/route')
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=15, stale-while-revalidate=30')
    expect(await response.json()).toEqual({ banner: { active: true, message: 'Tonight', window: 'Sat 10 Oct, 02:00 SGT' }, page: { active: true } })
    expect(JSON.stringify([...response.headers])).not.toMatch(/test-only-token|synthetic-bypass-value/)
})

it('returns inactive 200 on an outage, without leaking the connection string', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('https://edge-config.vercel.com/ecfg_example?token=test-only-token')))
    const { GET } = await import('@/app/api/maintenance/status/route')
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ banner: { active: false, message: '', window: '' }, page: { active: false } })
})
