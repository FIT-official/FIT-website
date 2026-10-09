// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ connect: vi.fn(), findById: vi.fn(), lean: vi.fn(), select: vi.fn(), content: vi.fn(), fileContent: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDatabase: mocks.connect }));
vi.mock('@/models/AppSettings', () => ({ default: { findById: mocks.findById } }));
vi.mock('@/models/ContentBlock', () => ({ default: { findOne: () => ({ lean: mocks.content }) } }));
vi.mock('@/models/BlogPost', () => ({ default: {} }));
vi.mock('@/lib/mdx', () => ({ getContentByPath: mocks.fileContent }));
import * as deliveryRoute from '@/app/api/delivery-types/route';
import { GET as categories } from '@/app/api/categories/route';
import { GET as content } from '@/app/api/content/route';
import { GET as currency } from '@/app/api/display-currency/route';
import { publicDeliveryTypes } from '@/lib/publicDeliveryTypes';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ lean: mocks.lean });
    mocks.lean.mockResolvedValue(null);
    mocks.content.mockResolvedValue(null);
    mocks.fileContent.mockReturnValue(null);
});

describe('public delivery metadata', () => {
    it('allows anonymous reads and exposes only the three display fields', async () => {
        mocks.lean.mockResolvedValue({ stripePriceTiers: { secret: 'private' }, additionalDeliveryTypes: [
            { name: 'courier', displayName: 'Courier', description: 'Weekdays', isActive: true,
                _id: 'private-id', basePricing: { basePrice: 99 }, pricingTiers: [{ price: 42 }], secret: 'private' },
            { name: 'retired', isActive: false },
        ] });
        const response = await deliveryRoute.GET(new Request('http://localhost/api/delivery-types'));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ deliveryTypes: [
            { name: 'digital', displayName: 'Digital Download', description: 'Instant download after purchase' },
            { name: 'courier', displayName: 'Courier', description: 'Weekdays' },
        ] });
        expect(mocks.select).toHaveBeenCalledWith(expect.not.stringContaining('basePricing'));
        expect(Object.keys(deliveryRoute)).toEqual(['GET']);
    });
    it('does not create settings when the singleton is absent', async () => {
        expect((await (await deliveryRoute.GET()).json()).deliveryTypes).toHaveLength(1);
        expect(await (await categories()).json()).toEqual({ categories: [] });
        expect(publicDeliveryTypes({ additionalDeliveryTypes: [{ name: 'unconfigured' }] })).toHaveLength(1);
    });
    it('returns an explicit service failure without disclosing the database error', async () => {
        mocks.lean.mockRejectedValueOnce(new Error('private database details'));
        const response = await deliveryRoute.GET();
        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain('private database');
    });
});

it.each(['navigation/mega-menu', 'home/print-cta', 'prints/banner'])('returns empty defaults for missing optional %s', async key => {
    const response = await content(new Request(`http://localhost/api/content?path=${key}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ frontmatter: {}, content: '' });
});
it('keeps unknown required content missing and preserves configured optional content', async () => {
    expect((await content(new Request('http://localhost/api/content?path=unknown'))).status).toBe(404);
    mocks.content.mockResolvedValue({ frontmatter: { title: 'Configured' }, content: 'Text' });
    expect(await (await content(new Request('http://localhost/api/content?path=home/print-cta'))).json())
        .toEqual({ frontmatter: { title: 'Configured' }, content: 'Text' });
});
it.each([['SG', 'SGD'], ['US', 'USD'], ['invalid', 'SGD'], [null, 'SGD']])('uses hosting country %s for display currency only', async (country, expected) => {
    const response = currency(new Request('http://localhost/api/display-currency', { headers: country ? { 'x-vercel-ip-country': country } : {} }));
    expect(await response.json()).toEqual({ currency: expected });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});
