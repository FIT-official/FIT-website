import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('@/app/HomeV1', () => ({ default: vi.fn(() => 'legacy home'), metadata: { title: 'Existing title' } }))
vi.mock('@/components/Home/v2/HomeV2', () => ({ default: vi.fn(() => 'new home') }))
vi.mock('@/lib/home/flags', async importOriginal => ({ ...(await importOriginal()), readHomeFlag: vi.fn() }))

import Home from '@/app/page'
import HomeV1 from '@/app/HomeV1'
import HomeV2 from '@/components/Home/v2/HomeV2'
import { readHomeFlag } from '@/lib/home/flags'

beforeEach(() => { vi.clearAllMocks(); readHomeFlag.mockResolvedValue({ enabled: false, sections: { shop: false } }) })
it('defaults to the existing home without loading v2 data', async () => {
    expect(await Home()).toBe('legacy home')
    expect(HomeV1).toHaveBeenCalledOnce()
    expect(HomeV2).not.toHaveBeenCalled()
})
it('forces v1 without reading Edge Config', async () => {
    expect(await Home({ searchParams: Promise.resolve({ home: 'v1' }) })).toBe('legacy home')
    expect(readHomeFlag).not.toHaveBeenCalled()
})
it('previews v2 and passes the section controls through', async () => {
    expect(await Home({ searchParams: Promise.resolve({ home: 'v2' }) })).toBe('new home')
    expect(HomeV2).toHaveBeenCalledWith({ sections: { shop: false } })
})
it('enables v2 from the flag alone', async () => {
    readHomeFlag.mockResolvedValue({ enabled: true, sections: {} })
    expect(await Home()).toBe('new home')
})
