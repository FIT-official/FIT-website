import { beforeEach, expect, it, vi } from 'vitest'
import { CURRENCY_CACHE_KEY, CURRENCY_CACHE_TTL, detectDisplayCurrency } from '@/lib/displayCurrency'

const now = 1800000000000
let fetcher
beforeEach(() => {
    localStorage.clear()
    fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ currency: 'USD' }) })
})
const detect = () => detectDisplayCurrency({ storage: localStorage, fetcher, now })

it('reuses a supported currency for less than 24 hours', async () => {
    localStorage.setItem(CURRENCY_CACHE_KEY, JSON.stringify({ currency: 'SGD', checkedAt: now - CURRENCY_CACHE_TTL + 1 }))
    expect(await detect()).toBe('SGD')
    expect(fetcher).not.toHaveBeenCalled()
})
it.each([
    JSON.stringify({ currency: 'SGD', checkedAt: now - CURRENCY_CACHE_TTL }),
    JSON.stringify({ currency: 'SGD', checkedAt: now + 1 }),
    JSON.stringify({ currency: 'BAD', checkedAt: now }),
    JSON.stringify({ currency: 'SGD' }), 'SGD', '{broken',
])('refreshes expired, malformed or legacy cache %s', async value => {
    localStorage.setItem(CURRENCY_CACHE_KEY, value)
    expect(await detect()).toBe('USD')
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/display-currency')
    expect(JSON.parse(localStorage.getItem(CURRENCY_CACHE_KEY))).toEqual({ currency: 'USD', checkedAt: now })
})
it.each(['network', 'http', 'unsupported'])('silently caches SGD on %s failure', async failure => {
    if (failure === 'network') fetcher.mockRejectedValue(Error('offline'))
    else fetcher.mockResolvedValue({ ok: failure !== 'http', json: async () => ({ currency: 'BAD' }) })
    expect(await detect()).toBe('SGD')
    expect(await detect()).toBe('SGD')
    expect(fetcher).toHaveBeenCalledTimes(1)
})
it('works when browser storage is blocked', async () => {
    const blocked = () => { throw Error('blocked') }
    expect(await detectDisplayCurrency({ storage: { getItem: blocked, setItem: blocked }, fetcher, now })).toBe('USD')
})
