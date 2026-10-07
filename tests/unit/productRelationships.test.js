import { afterEach, expect, it, vi } from 'vitest';
import { loadProductRelationship } from '@/lib/productRelationships';
afterEach(() => vi.unstubAllGlobals());
it('coalesces a grid and resolves duplicate cards from one response', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ products: [{ _id: 'one', likeCount: 7 }, { _id: 'two', likeCount: 3 }] }) }));
    vi.stubGlobal('fetch', fetch);
    const results = await Promise.all(['one', 'two', 'one'].map(loadProductRelationship));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new URL(fetch.mock.calls[0][0], 'https://fit.test').searchParams.get('ids')).toBe('one,two');
    expect(results.map(r => r.likeCount)).toEqual([7, 3, 7]);
});
it('does not leave cards waiting when network or response fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
    expect(await loadProductRelationship('one')).toBeNull();
    fetch.mockResolvedValue({ ok: false });
    expect(await loadProductRelationship('one')).toBeNull();
});
it('bounds large grids and does not retain prior responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ products: [] }) })));
    const results = await Promise.all(Array.from({ length: 201 }, (_, i) => loadProductRelationship(String(i))));
    expect(results).toHaveLength(201);
    expect(fetch).toHaveBeenCalledTimes(3);
    await loadProductRelationship('0');
    expect(fetch).toHaveBeenCalledTimes(4);
});
