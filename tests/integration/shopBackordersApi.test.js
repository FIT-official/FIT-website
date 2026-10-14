import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ identity: vi.fn(), owner: vi.fn(), update: vi.fn(), db: vi.fn(), auth: vi.fn(), admin: vi.fn(), allocate: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDatabase: m.db }));
vi.mock('@/lib/cartOwner', () => ({ cartIdentity: m.identity, cartOwner: m.owner, withCartCookie: x => x }));
vi.mock('@/models/User', () => ({ default: { updateOne: m.update } }));
vi.mock('@/models/Product', () => ({ default: {} }));
vi.mock('@/lib/checkoutAttempt', () => ({ checkoutIntent: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({ auth: m.auth }));
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: m.admin }));
vi.mock('@/lib/shopBackorders/host', () => ({ backorders: async () => ({ allocateRestock: m.allocate }) }));
import { PUT } from '@/app/api/user/cart/route';
import { GET as ownerGet, POST as ownerPost } from '@/app/api/admin/shop-backorders/route';
const cartItemId = '0123456789abcdef01234567';
const request = (body, origin = 'https://fit.test') => new Request('https://fit.test/api/user/cart', { method: 'PUT', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); m.identity.mockResolvedValue({ userId: 'synthetic_buyer' }); m.owner.mockResolvedValue({ cart: [{ _id: cartItemId, quantity: 2, productId: cartItemId, chosenDeliveryType: 'shipping' }] }); m.update.mockResolvedValue({ matchedCount: 1 }); m.auth.mockResolvedValue({ userId: 'synthetic_admin' }); m.admin.mockResolvedValue(true); m.allocate.mockResolvedValue({ allocated: 1, revision: 1 }); });
describe('Exact shop cart quantity', () => {
    it.each([0, -1, 1.1, 101, '5'])('rejects invalid quantity %s before touching the database', async quantity => {
        expect((await PUT(request({ cartItemId, quantity, expectedQuantity: 2 }))).status).toBe(400); expect(m.db).not.toHaveBeenCalled();
    });
    it('compares the old quantity and scopes the update to the actual cart owner', async () => {
        expect((await PUT(request({ cartItemId, quantity: 7, expectedQuantity: 2 }))).status).toBe(200);
        expect(m.update.mock.calls[0][0]).toMatchObject({ userId: 'synthetic_buyer', cart: { $elemMatch: { quantity: 2 } } });
        expect(m.update.mock.calls[0][1]).toEqual({ $set: { 'cart.$.quantity': 7 } });
        m.update.mockResolvedValue({ matchedCount: 0 });
        expect((await PUT(request({ cartItemId, quantity: 7, expectedQuantity: 2 }))).status).toBe(409);
    });
    it('rejects cross-origin mutation and missing owner before writing', async () => {
        expect((await PUT(request({ cartItemId, quantity: 7, expectedQuantity: 2 }, 'https://foreign.test'))).status).toBe(403);
        m.identity.mockResolvedValue({}); expect((await PUT(request({}))).status).toBe(401); expect(m.update).not.toHaveBeenCalled();
    });
    it('keeps a quoted custom print at its fixed quantity', async () => {
        m.owner.mockResolvedValue({ cart: [{ _id: cartItemId, productId: 'custom-print:synthetic' }] });
        expect((await PUT(request({ cartItemId, quantity: 2, expectedQuantity: 1 }))).status).toBe(400);
    });
});
describe('Owner restock allocation boundary', () => {
    it('shows current non-restockable and cancelled-line status from their authoritative records', async () => {
        const orders = [{ _id: cartItemId, orderId: 'synthetic-order', userId: 'synthetic_buyer', stripeSessionId: 'synthetic_session', items: [{ productId: cartItemId, sourceCartItemId: cartItemId, selectedVariants: {}, stockAllocation: { backorderQuantity: 3 } }] }];
        const collections = {
            orders: { find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => orders }) }) }) },
            products: { find: () => ({ toArray: async () => [{ _id: cartItemId, stock: 0, restockStatus: 'not_restocked' }] }) },
            users: { aggregate: () => ({ toArray: async () => [{ userId: 'synthetic_buyer', orderHistory: [{ stripeSessionId: 'synthetic_session', status: 'cancelled', cartItem: { sourceCartItemId: cartItemId } }] }] }) },
        };
        m.db.mockResolvedValue({ connection: { db: { collection: name => collections[name] } } });
        const result = await ownerGet(new Request('https://fit.test/api/admin/shop-backorders'));
        expect(result.status).toBe(200); expect(result.headers.get('Cache-Control')).toBe('private, no-store');
        expect((await result.json()).orders[0].items[0]).toMatchObject({ currentRestockStatus: 'not_restocked', fulfillmentStatus: 'cancelled' });
    });
    it('denies non-admin callers before database or allocation access', async () => {
        m.admin.mockResolvedValue(false);
        expect((await ownerGet(new Request('https://fit.test/api/admin/shop-backorders'))).status).toBe(403);
        expect((await ownerPost(request({}))).status).toBe(403); expect(m.db).not.toHaveBeenCalled(); expect(m.allocate).not.toHaveBeenCalled();
    });
    it('rejects foreign origins and takes the actor identity only from Clerk', async () => {
        const body = { orderId: 'synthetic-order', cartItemId, quantity: 1, expectedRevision: 0, actorId: 'forged' };
        expect((await ownerPost(request(body, 'https://foreign.test'))).status).toBe(403);
        expect((await ownerPost(request(body))).status).toBe(200);
        expect(m.allocate).toHaveBeenCalledWith({ ...body, actorId: 'synthetic_admin' });
    });
});
