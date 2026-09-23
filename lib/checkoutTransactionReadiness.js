export class CheckoutTransactionUnavailableError extends Error {
    constructor() {
        super('Checkout is temporarily unavailable. No payment has been started. Please try again later.');
        this.name = 'CheckoutTransactionUnavailableError';
        this.code = 'checkout_transaction_unavailable';
        this.status = 503;
    }
}

export function createCheckoutTransactionPreflight({ ttlMs = 60000, now = Date.now } = {}) {
    const verifiedUntil = new WeakMap();
    return async function verify(database, { force = false } = {}) {
        const db = database?.connection?.db;
        if (!db) throw new CheckoutTransactionUnavailableError();
        if (!force && (verifiedUntil.get(db) || 0) > now()) return;
        // A failed fresh check must also invalidate any earlier successful check.
        verifiedUntil.delete(db);
        let session, started = false, verified = false;
        try {
            session = await database.startSession();
            session.startTransaction({ readConcern: { level: 'snapshot' }, readPreference: 'primary' });
            started = true;
            // Starting a session alone does not contact MongoDB. This bounded
            // read actually executes a transaction, without reading customer fields.
            await db.collection('checkoutsessions').findOne({}, {
                session, projection: { _id: 1 }, maxTimeMS: 5000,
            });
            verified = true;
        } catch {
            verified = false;
        } finally {
            if (started) {
                try { await session.abortTransaction(); } catch { verified = false; }
            }
            if (session) {
                try { await session.endSession(); } catch { verified = false; }
            }
        }
        if (!verified) throw new CheckoutTransactionUnavailableError();
        verifiedUntil.set(db, now() + ttlMs);
    };
}

export const verifyCheckoutTransactions = createCheckoutTransactionPreflight();
