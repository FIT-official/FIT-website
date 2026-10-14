import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { checkAdminPrivileges } from '@/lib/checkPrivileges';
import { backorders } from '@/lib/shopBackorders/host';
import { connectToDatabase } from '@/lib/db';
import { BackorderError, selectedAvailability } from '@/lib/shopBackorders/policy';
import { mongo } from 'mongoose';
const json = (value, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'X-Robots-Tag': 'noindex, nofollow' } });
async function actor() { const { userId } = await auth(); return userId && await checkAdminPrivileges(userId) ? userId : null; }
export async function GET(req) {
    if (!await actor()) return json({ error: 'Owner access required.' }, 403);
    try {
        const cursor = new URL(req.url).searchParams.get('cursor');
        if (cursor && !/^[a-f0-9]{24}$/i.test(cursor)) return json({ error: 'Invalid cursor.' }, 400);
        const c = await connectToDatabase();
        const orders = await c.connection.db.collection('orders').find({ 'items.stockAllocation.backorderQuantity': { $gt: 0 },
            ...(cursor ? { _id: { $lt: new mongo.ObjectId(cursor) } } : {}) },
        { projection: { orderId: 1, userId: 1, stripeSessionId: 1, customerName: 1, createdAt: 1, status: 1, items: 1 } }).sort({ _id: -1 }).limit(51).toArray();
        const visible = orders.slice(0, 50);
        const productIds = [...new Set(visible.flatMap(order => order.items.map(item => String(item.productId))))].filter(id => /^[a-f0-9]{24}$/i.test(id));
        const products = productIds.length ? await c.connection.db.collection('products').find({ _id: { $in: productIds.map(id => new mongo.ObjectId(id)) } }, { projection: { restockStatus: 1, stock: 1, infiniteStock: 1, variantTypes: 1 } }).toArray() : [];
        const users = visible.length ? await c.connection.db.collection('users').aggregate([
            { $match: { 'orderHistory.stripeSessionId': { $in: visible.map(order => order.stripeSessionId) } } },
            { $project: { userId: 1, orderHistory: { $filter: { input: '$orderHistory', as: 'entry', cond: { $in: ['$$entry.stripeSessionId', visible.map(order => order.stripeSessionId)] } } } } },
        ]).toArray() : [];
        for (const order of visible) for (const item of order.items) {
            const product = products.find(product => String(product._id) === String(item.productId));
            try { item.currentRestockStatus = product ? selectedAvailability(product, item.selectedVariants).restockStatus : 'unknown'; }
            catch { item.currentRestockStatus = 'unknown'; }
            const history = users.find(user => user.userId === order.userId)?.orderHistory.find(entry => entry.stripeSessionId === order.stripeSessionId && entry.cartItem?.sourceCartItemId === item.sourceCartItemId);
            item.fulfillmentStatus = history?.status || 'review_required';
        }
        return json({ orders: visible, nextCursor: orders.length > 50 ? String(orders[49]._id) : null });
    } catch { return json({ error: 'Backorders could not be loaded.' }, 503); }
}
export async function POST(req) {
    const actorId = await actor();
    if (!actorId) return json({ error: 'Owner access required.' }, 403);
    if (req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Use the FIT owner dashboard.' }, 403);
    try {
        const raw = await req.text();
        if (raw.length > 4000) return json({ error: 'Request too large.' }, 413);
        const input = JSON.parse(raw);
        if (typeof input.orderId !== 'string' || input.orderId.length > 200 || typeof input.cartItemId !== 'string' || input.cartItemId.length > 100) return json({ error: 'Invalid order line.' }, 400);
        return json(await (await backorders()).allocateRestock({ orderId: input.orderId, cartItemId: input.cartItemId,
            quantity: input.quantity, expectedRevision: input.expectedRevision, actorId }));
    } catch (error) { return json({ error: error instanceof BackorderError ? error.message : 'Allocation could not be saved.' }, error instanceof BackorderError ? error.status : 503); }
}
