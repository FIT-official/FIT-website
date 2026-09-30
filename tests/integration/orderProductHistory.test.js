import { describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), findUser: vi.fn(), findProduct: vi.fn(), products: [] }));
vi.mock('@clerk/nextjs/server', () => ({ auth: m.auth, clerkClient: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDatabase: async () => {} }));
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: vi.fn() }));
vi.mock('@/models/User', () => ({ default: { findOne: m.findUser } }));
vi.mock('@/models/Product', () => ({ default: { find: (...args) => { m.findProduct(...args); return { select: () => ({ lean: async () => m.products }) }; } } }));
vi.mock('@/models/CheckoutSession', () => ({ default: { find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }) } }));
import { GET } from '@/app/api/user/orders/route';

describe('buyer order product summaries', () => {
    it('looks up only the authenticated buyer\'s ordered products and preserves hidden item details', async () => {
        const productId = '000000000000000000000001';
        m.auth.mockResolvedValue({ userId: 'buyer' });
        m.findUser.mockResolvedValue({ orderHistory: [{ _id: 'order1', cartItem: { productId, quantity: 2, price: 4.9 } }] });
        m.products = [{ _id: productId, name: 'TFT display', images: ['display.jpg'], hidden: true, slug: 'old-display', paidAssets: ['secret'] }];
        const response = await GET(new Request('https://fit.example/api/user/orders'));
        expect(response.status).toBe(200);
        expect(m.findUser).toHaveBeenCalledWith({ userId: 'buyer' }, expect.any(Object));
        expect(m.findProduct).toHaveBeenCalledWith({ _id: { $in: [productId] } });
        expect((await response.json()).orders[0]).toMatchObject({ cartItem: { quantity: 2, price: 4.9 }, productSummary: { name: 'TFT display', images: ['display.jpg'] } });
    });
});
