import { createHash, randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { allocateLines, BackorderError, RESTOCKING_VERSION } from './policy.js';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash('sha256').update(JSON.stringify(canonical(plain(value)))).digest('hex');
const { ObjectId } = mongo;
const plain = value => JSON.parse(JSON.stringify(value));
const objectId = value => { if (!ObjectId.isValid(String(value))) throw new BackorderError('Invalid product identity.'); return new ObjectId(String(value)); };
const fail = (message, code, status) => { throw new BackorderError(message, code, status); };
export function createBackorderStore({ db, client, now = () => new Date() }) {
    const products = db.collection('products'), holds = db.collection('shopbackorderallocations');
    const attempts = db.collection('checkoutattempts'), users = db.collection('users'), orders = db.collection('orders');
    async function transaction(fn) {
        const session = client.startSession();
        try { return await session.withTransaction(() => fn(session), { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }); }
        finally { await session.endSession(); }
    }
    async function quote(items, session, excludeId, options) {
        const ids = [...new Set(items.filter(i => !i.requestId && !String(i.productId).startsWith('custom-print:')).map(i => String(i.productId)))].sort();
        const rows = await products.find({ _id: { $in: ids.map(objectId) } }, { session }).toArray();
        if (rows.length !== ids.length) fail('A product no longer exists.');
        const active = await holds.find({ status: 'held', productIds: { $in: ids }, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }, { session }).toArray();
        const lines = allocateLines(items, plain(rows), active.flatMap(h => h.lines.filter(Boolean)), options);
        return { lines, token: digest(lines), blocked: lines.some(l => l?.blocked), requiresAcknowledgement: lines.some(l => l?.backorderQuantity > 0),
            disclosureVersion: RESTOCKING_VERSION, checkedAt: now().toISOString() };
    }
    async function fence(ids, session) {
        for (const id of [...new Set(ids)].sort()) {
            const result = await products.updateOne({ _id: objectId(id) }, { $inc: { backorderRevision: 1 } }, { session });
            if (!result.matchedCount) fail('Product changed. Review availability again.');
        }
    }
    async function release(attemptId, userId, provider) {
        if (provider?.status !== 'expired' || provider.payment_status !== 'unpaid') fail('Keep stock held until the exact payment is confirmed expired and unpaid.');
        return transaction(async session => {
            const row = await holds.findOne({ _id: attemptId, userId }, { session });
            if (!row || row.status === 'released') return;
            const attempt = await attempts.findOne({ _id: attemptId, userId }, { session });
            if (row.status !== 'held' || attempt?.sessionId !== provider.id) fail('Payment allocation needs reconciliation.');
            await fence(row.productIds, session);
            await holds.updateOne({ _id: attemptId, status: 'held' }, { $set: { status: 'released', resolvedAt: now(), providerSessionId: provider.id } }, { session });
        });
    }
    return {
        quote, release,
        async reserveAttempt({ attemptId, userId, snapshot, stripeParams, token, acknowledged }) {
            if (!/^[a-f0-9-]{36}$/i.test(attemptId || '')) fail('Invalid checkout identity.');
            const execute = () => transaction(async session => {
                const previous = await attempts.findOne({ _id: attemptId }, { session });
                if (previous) { if (previous.userId !== userId) fail('Checkout belongs to another buyer.', 'forbidden', 403); return previous; }
                const user = await users.findOne({ userId, checkoutIntent: attemptId }, { session });
                if (!user) fail('Cart changed. Review it again.', 'stock_quote_changed');
                const identity = items => items.map(item => { const i = item.sourceCart || item; return [String(i._id || item.cartItemId), String(i.productId), i.quantity,
                    Object.entries(i.selectedVariants || {}).sort(), i.chosenDeliveryType, i.orderNote || '']; });
                if (digest(identity(plain(user.cart))) !== digest(identity(snapshot.items))) fail('Cart changed. Review it again.', 'stock_quote_changed');
                if (await holds.findOne({ userId, status: 'held' }, { session })) fail('An earlier payment still holds stock. Check or cancel that payment first.');
                const current = await quote(snapshot.items, session);
                if (current.blocked) fail(current.lines.find(l => l?.blocked).issue, 'stock_unavailable');
                if (token !== current.token || (current.requiresAcknowledgement && acknowledged !== RESTOCKING_VERSION)) fail('Review current stock and the restocking notice before payment.', 'stock_quote_changed');
                const items = snapshot.items.map((item, i) => current.lines[i] ? { ...item, stockAllocation: { ...current.lines[i], checkedAt: current.checkedAt,
                    ...(current.requiresAcknowledgement ? { acknowledgedAt: now().toISOString() } : {}) } } : item);
                // Normalize once before hashing/inserting: BSON otherwise turns
                // undefined properties into null and changes the paid contract.
                const saved = plain({ ...snapshot, items, stockContractVersion: 1 });
                const productIds = [...new Set(current.lines.filter(Boolean).map(l => l.productId))];
                await users.updateOne({ _id: user._id }, { $inc: { backorderRevision: 1 } }, { session });
                await fence(productIds, session);
                await holds.insertOne({ _id: attemptId, userId, productIds, lines: current.lines, contractHash: digest(saved), status: 'held', createdAt: now() }, { session });
                const attempt = { _id: attemptId, userId, snapshot: saved, stripeParams, createdAt: now(), updatedAt: now() };
                await attempts.insertOne(attempt, { session });
                return attempt;
            });
            try { return await execute(); } catch (error) {
                if (error.code === 11000) { const existing = await attempts.findOne({ _id: attemptId, userId }); if (existing) return existing; }
                throw error;
            }
        },
        async consume(checkout, session) {
            const row = await holds.findOne({ _id: checkout.attemptId, userId: checkout.userId, status: 'held' }, { session });
            const attempt = await attempts.findOne({ _id: checkout.attemptId, userId: checkout.userId }, { session });
            if (!row || !attempt || row.contractHash !== digest(attempt.snapshot)
                || digest(checkout.items) !== digest(attempt.snapshot.items)) fail('Paid stock allocation needs reconciliation.');
            await fence(row.productIds, session);
            await holds.updateOne({ _id: row._id, status: 'held' }, { $set: { status: 'consumed', resolvedAt: now() } }, { session });
        },
        async assertLegacyAvailable(product, item, session) {
            if (!product.backorderRevision) return;
            const current = await quote([{ ...item, _id: item.cartItemId }], session, undefined, { fulfillment: true });
            const line = current.lines[0];
            if (line && (line.blocked || line.onHandQuantity !== item.quantity)) fail('Legacy paid stock is held or unavailable; owner reconciliation required.');
        },
        async allocateRestock({ orderId, cartItemId, quantity, expectedRevision, actorId }) {
            if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100 || !Number.isSafeInteger(expectedRevision)) fail('Enter a valid quantity and revision.', 'invalid_input', 400);
            return transaction(async session => {
                const order = await orders.findOne({ orderId }, { session });
                if (!order || ['cancelled', 'refunded', 'partially_refunded'].includes(order.status)) fail('Order cannot receive an allocation.');
                const line = order.items.find(i => i.sourceCartItemId === cartItemId);
                if (!line?.stockAllocation) fail('Backorder line not found.');
                // Existing order-status controls persist per-line status in the
                // buyer history. Read that authority too, before deducting stock.
                const owner = await users.findOne({ userId: order.userId }, { session });
                const history = owner?.orderHistory?.find(entry => entry.stripeSessionId === order.stripeSessionId && entry.cartItem?.sourceCartItemId === cartItemId);
                if (!history || ['cancelled', 'refunded', 'partially_refunded'].includes(history.status)) fail('Order line is cancelled, refunded or requires reconciliation.');
                const previous = line.backorderFulfillment || { allocated: 0, revision: 0 };
                if (previous.revision !== expectedRevision) fail('Allocation changed. Reload the order.', 'revision_conflict');
                if (quantity > line.stockAllocation.backorderQuantity - previous.allocated) fail('Quantity exceeds the remaining backorder.');
                const item = { ...line, cartItemId, quantity, productId: String(line.productId), selectedVariants: line.selectedVariants || {} };
                const current = (await quote([item], session, undefined, { fulfillment: true })).lines[0];
                if (!current || current.onHandQuantity < quantity) fail('Record received inventory first. There is not enough available stock.');
                const product = await products.findOne({ _id: objectId(item.productId) }, { session });
                const inc = { backorderRevision: 1 };
                if (product.stock != null) inc.stock = -quantity;
                for (let t = 0; t < (product.variantTypes || []).length; t++) {
                    const type = product.variantTypes[t], o = type.options.findIndex(v => v.name === item.selectedVariants[type.name]);
                    if (o >= 0 && type.options[o].stock != null) inc[`variantTypes.${t}.options.${o}.stock`] = -quantity;
                }
                await products.updateOne({ _id: product._id }, { $inc: inc }, { session });
                const next = { allocated: previous.allocated + quantity, revision: expectedRevision + 1, updatedAt: now() };
                await orders.updateOne({ _id: order._id }, { $set: { 'items.$[line].backorderFulfillment': next } }, { session, arrayFilters: [{ 'line.sourceCartItemId': cartItemId }] });
                await users.updateOne({ userId: order.userId }, { $set: { 'orderHistory.$[entry].cartItem.backorderFulfillment': next } },
                    { session, arrayFilters: [{ 'entry.stripeSessionId': order.stripeSessionId, 'entry.cartItem.sourceCartItemId': cartItemId }] });
                await db.collection('shopbackorderaudit').insertOne({ _id: randomUUID(), orderId, cartItemId, quantity, actorId, at: now(), revision: next.revision }, { session });
                return next;
            });
        },
    };
}
