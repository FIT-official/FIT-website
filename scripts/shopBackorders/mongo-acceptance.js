import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose, { mongo } from 'mongoose';
import CheckoutSession from '../../models/CheckoutSession.js';
import Order from '../../models/Order.js';
import User from '../../models/User.js';
import { createBackorderStore } from '../../lib/shopBackorders/store.js';
import { RESTOCKING_VERSION } from '../../lib/shopBackorders/policy.js';
export async function run(client) {
    const db = client.db(), store = createBackorderStore({ db, client });
    const productId = new mongo.ObjectId(), checks = [];
    await db.collection('products').insertOne({ _id: productId, slug: 'synthetic-goods', productType: 'shop', stock: 3,
        variantTypes: [{ name: 'Colour', options: [{ name: 'Blue', stock: 3 }] }] });
    async function buyer(quantity, userId = randomUUID()) {
        const id = new mongo.ObjectId(), attemptId = randomUUID();
        const cart = [{ _id: id, productId: String(productId), quantity, selectedVariants: { Colour: 'Blue' }, chosenDeliveryType: 'shipping' }];
        await db.collection('users').insertOne({ userId, checkoutIntent: attemptId, cart, orderHistory: [] });
        const snapshot = { stockContractVersion: 1, userId, items: cart.map(i => ({ ...i, _id: undefined, cartItemId: String(id), sourceCart: JSON.parse(JSON.stringify(i)) })) };
        const quote = await store.quote(JSON.parse(JSON.stringify(cart)));
        return { attemptId, userId, snapshot, stripeParams: { synthetic: true }, token: quote.token, acknowledged: RESTOCKING_VERSION };
    }
    const a = await buyer(5), b = await buyer(5);
    const race = await Promise.allSettled([store.reserveAttempt(a), store.reserveAttempt(b)]);
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(race.find(r => r.status === 'rejected').reason.code, 'stock_quote_changed');
    checks.push('Two buyers racing for the same last units cannot both allocate them; stale disclosure is rejected.');
    const winnerInput = race[0].status === 'fulfilled' ? a : b, loserInput = winnerInput === a ? b : a;
    const winner = race.find(r => r.status === 'fulfilled').value;
    assert.deepEqual([winner.snapshot.items[0].stockAllocation.onHandQuantity, winner.snapshot.items[0].stockAllocation.backorderQuantity], [3, 2]);
    assert.equal((await db.collection('products').findOne({ _id: productId })).stock, 3);
    checks.push('A hold keeps physical counts unchanged and splits 3 available / 2 backordered.');
    const reread = await store.quote(loserInput.snapshot.items);
    const loser = await store.reserveAttempt({ ...loserInput, token: reread.token });
    assert.deepEqual([loser.snapshot.items[0].stockAllocation.onHandQuantity, loser.snapshot.items[0].stockAllocation.backorderQuantity], [0, 5]);
    checks.push('A new review can accept zero available / five backordered, without consuming stock.');
    const replay = await Promise.all(Array.from({ length: 5 }, () => store.reserveAttempt(winnerInput)));
    assert.ok(replay.every(row => row._id === winner._id));
    assert.equal(await db.collection('shopbackorderallocations').countDocuments(), 2);
    checks.push('Concurrent retries preserve the same immutable allocation and create no duplicate holds.');
    await db.collection('checkoutattempts').updateOne({ _id: loser._id }, { $set: { sessionId: 'synthetic_loser' } });
    await assert.rejects(store.release(loser._id, loser.userId, { id: 'synthetic_loser', status: 'complete', payment_status: 'unpaid' }));
    await assert.rejects(store.release(loser._id, loser.userId, { id: 'wrong', status: 'expired', payment_status: 'unpaid' }));
    await store.release(loser._id, loser.userId, { id: 'synthetic_loser', status: 'expired', payment_status: 'unpaid' });
    await store.release(loser._id, loser.userId, { id: 'synthetic_loser', status: 'expired', payment_status: 'unpaid' });
    checks.push('Only the exact provider-confirmed expired/unpaid session releases a hold; replay is harmless.');
    const denied = await buyer(4);
    await assert.rejects(store.reserveAttempt({ ...denied, acknowledged: null }), { code: 'stock_quote_changed' });
    checks.push('Missing acknowledgement cannot create a payable attempt.');
    const session = client.startSession();
    try {
        await assert.rejects(session.withTransaction(async () => { await store.consume({ attemptId: winner._id, userId: winner.userId, items: winner.snapshot.items }, session); throw Error('synthetic rollback'); }));
        assert.equal((await db.collection('shopbackorderallocations').findOne({ _id: winner._id })).status, 'held');
        await session.withTransaction(async () => {
            await store.consume({ attemptId: winner._id, userId: winner.userId, items: winner.snapshot.items }, session);
            await db.collection('products').updateOne({ _id: productId, stock: { $gte: 3 } }, { $inc: { stock: -3, 'variantTypes.0.options.0.stock': -3 } }, { session });
        });
    } finally { await session.endSession(); }
    assert.equal((await db.collection('products').findOne({ _id: productId })).stock, 0);
    checks.push('Allocation consumption rolls back with payment/order failure; a committed payment deducts only three physical units.');
    const item = winner.snapshot.items[0], orderId = 'SYNTHETIC-ORDER', sourceCartItemId = item.cartItemId;
    await db.collection('orders').insertOne({ orderId, userId: winner.userId, stripeSessionId: 'synthetic_paid', status: 'pending', items: [{ ...item, productId, sourceCartItemId, backorderFulfillment: { allocated: 0, revision: 0 } }] });
    await db.collection('users').updateOne({ userId: winner.userId }, { $set: { orderHistory: [{ stripeSessionId: 'synthetic_paid', cartItem: { sourceCartItemId } }] } });
    await assert.rejects(store.allocateRestock({ orderId, cartItemId: sourceCartItemId, quantity: 1, expectedRevision: 0, actorId: 'synthetic_admin' }));
    await db.collection('products').updateOne({ _id: productId }, { $inc: { stock: 2, 'variantTypes.0.options.0.stock': 2 } });
    await db.collection('users').updateOne({ userId: winner.userId }, { $set: { 'orderHistory.0.status': 'cancelled' } });
    await assert.rejects(store.allocateRestock({ orderId, cartItemId: sourceCartItemId, quantity: 2, expectedRevision: 0, actorId: 'synthetic_admin' }));
    assert.equal((await db.collection('products').findOne({ _id: productId })).stock, 2);
    await db.collection('users').updateOne({ userId: winner.userId }, { $set: { 'orderHistory.0.status': 'pending' } });
    await db.collection('products').updateOne({ _id: productId }, { $set: { hidden: true } });
    checks.push('Legacy per-line cancellation blocks allocation without stock loss; hidden paid products can still be fulfilled.');
    const ownerRace = await Promise.allSettled(Array.from({ length: 2 }, () => store.allocateRestock({ orderId, cartItemId: sourceCartItemId, quantity: 2, expectedRevision: 0, actorId: 'synthetic_admin' })));
    assert.equal(ownerRace.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await db.collection('products').findOne({ _id: productId })).stock, 0);
    const saved = await db.collection('orders').findOne({ orderId });
    assert.equal(saved.items[0].backorderFulfillment.allocated, 2);
    assert.equal(saved.items[0].stockAllocation.backorderQuantity, 2);
    assert.equal((await db.collection('users').findOne({ userId: winner.userId })).orderHistory[0].cartItem.backorderFulfillment.allocated, 2);
    checks.push('Restocking requires actual recorded stock; racing owner allocations deduct once and preserve the original disclosure.');
    const reconnected = new mongo.MongoClient(process.env.MONGODB_URI);
    try { await reconnected.connect(); assert.equal((await reconnected.db().collection('orders').findOne({ orderId })).items[0].backorderFulfillment.allocated, 2); }
    finally { await reconnected.close(); }
    checks.push('Allocation and fulfillment survive a fresh database connection.');
    const connection = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
    try {
        const Sessions = connection.model('SyntheticSessionSchema', CheckoutSession.schema, 'synthetic_schema_sessions');
        const Orders = connection.model('SyntheticOrderSchema', Order.schema, 'synthetic_schema_orders');
        const Users = connection.model('SyntheticUserSchema', User.schema, 'synthetic_schema_users');
        const stored = await Sessions.create({ ...winner.snapshot, sessionId: 'synthetic_schema_session', attemptId: winner._id, totalAmount: 5000 });
        const read = await Sessions.findById(stored._id);
        assert.deepEqual(read.items[0].stockAllocation, winner.snapshot.items[0].stockAllocation);
        const orderLine = { productId, productName: 'Synthetic goods', productSlug: 'synthetic-goods', quantity: 5, sourceCartItemId,
            selectedVariants: { Colour: 'Blue' }, chosenDeliveryType: 'pick-up', basePrice: 10, priceBeforeDiscount: 10, finalPrice: 10, totalPrice: 50,
            stockAllocation: winner.snapshot.items[0].stockAllocation, backorderFulfillment: { allocated: 2, revision: 1 } };
        const order = await Orders.create({ orderId: 'SYNTHETIC-SCHEMA', stripeSessionId: 'synthetic_schema_session', userId: 'synthetic_schema_buyer', customerEmail: 'fixture@example.test', items: [orderLine], subtotal: 50, totalAmount: 50 });
        const user = await Users.create({ userId: 'synthetic_schema_buyer', orderHistory: [{ stripeSessionId: 'synthetic_schema_session', cartItem: { ...orderLine, productId: String(productId), price: 10 } }] });
        assert.equal((await Orders.findById(order._id)).items[0].stockAllocation.backorderQuantity, 2);
        assert.equal((await Users.findById(user._id)).orderHistory[0].cartItem.backorderFulfillment.allocated, 2);
        checks.push('Actual Mongoose checkout, order and user-history schemas persist and reload the allocation and fulfillment fields.');
    } finally { await connection.close(); }
    return checks;
}
