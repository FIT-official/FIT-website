import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ enabled: false, db: vi.fn(), product: vi.fn(), quote: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDatabase: m.db }));
vi.mock('@/lib/shopBackorders/host', () => ({ backordersEnabled: () => m.enabled, backorders: async () => ({ quote: m.quote }) }));
vi.mock('@/models/Product', () => ({ default: { findById: () => ({ lean: m.product }) } }));
import { GET } from '@/app/api/shop/availability/route';
const request = query => new Request('https://fit.test/api/shop/availability?' + new URLSearchParams({ productId: '0123456789abcdef01234567', quantity: '5', ...query }));
beforeEach(() => { vi.clearAllMocks(); m.enabled = true; m.product.mockResolvedValue({ productType: 'shop' }); m.quote.mockResolvedValue({ lines: [{ onHandQuantity: 2, backorderQuantity: 3 }], checkedAt: 'synthetic' }); });
describe('Public shop availability', () => {
    it('does not connect to the database when the feature is disabled', async () => { m.enabled = false; expect(await (await GET(request())).json()).toEqual({ enabled: false }); expect(m.db).not.toHaveBeenCalled(); });
    it.each([{ hidden: true }, { flaggedForModeration: true }, { listing: 'creator' }, { productType: 'print' }])('does not disclose unavailable/private product stock: %j', async extra => { m.product.mockResolvedValue({ productType: 'shop', ...extra }); expect((await GET(request())).status).toBe(404); expect(m.quote).not.toHaveBeenCalled(); });
    it.each([{ quantity: '101' }, { quantity: '1.1' }, { variants: '[]' }, { productId: 'invalid' }])('rejects invalid selection before database access: %j', async query => { expect((await GET(request(query))).status).toBe(400); expect(m.db).not.toHaveBeenCalled(); });
    it('returns the computed split without private product fields or caching', async () => { const result = await GET(request()); expect(result.headers.get('Cache-Control')).toBe('no-store'); expect(await result.json()).toEqual({ enabled: true, allocation: { onHandQuantity: 2, backorderQuantity: 3 }, checkedAt: 'synthetic' }); });
});
