import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), admin: vi.fn(), save: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({ auth: m.auth, clerkClient: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDatabase: async () => {} }));
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: m.admin }));
vi.mock('@/models/User', () => ({ default: { findOne: m.user } }));
vi.mock('@/models/Product', () => ({ default: {} }));
vi.mock('@/models/CheckoutSession', () => ({ default: {} }));
import { PUT } from '@/app/api/user/orders/route';
let line;
beforeEach(() => {
    vi.clearAllMocks(); m.auth.mockResolvedValue({ userId: 'synthetic_owner' }); m.admin.mockResolvedValue(true);
    line = { status: 'pending', cartItem: { stockAllocation: { backorderQuantity: 3 }, backorderFulfillment: { allocated: 1 } } };
    m.user.mockResolvedValue({ userId: 'synthetic_buyer', orderHistory: { id: () => line }, save: m.save });
});
describe('Outstanding backorder fulfillment guard', () => {
    it.each(['shipped', 'delivered'])('blocks marking the full line %s while units remain outstanding', async status => {
        const response = await PUT({ json: async () => ({ orderId: 'synthetic', status }) });
        expect(response.status).toBe(409); expect(m.save).not.toHaveBeenCalled(); expect(line.status).toBe('pending');
    });
    it('permits fulfillment after all outstanding units are allocated', async () => {
        line.cartItem.backorderFulfillment.allocated = 3;
        expect((await PUT({ json: async () => ({ orderId: 'synthetic', status: 'shipped' }) })).status).toBe(200);
        expect(m.save).toHaveBeenCalledOnce(); expect(line.status).toBe('shipped');
    });
    it('leaves legacy order fulfillment unchanged', async () => {
        line.cartItem = {};
        expect((await PUT({ json: async () => ({ orderId: 'synthetic', status: 'delivered' }) })).status).toBe(200);
    });
});
