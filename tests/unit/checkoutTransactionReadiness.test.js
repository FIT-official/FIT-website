import { describe, expect, it, vi } from 'vitest';
import { createCheckoutTransactionPreflight, CheckoutTransactionUnavailableError } from '@/lib/checkoutTransactionReadiness';

function fixture() {
    const session = { startTransaction: vi.fn(), abortTransaction: vi.fn().mockResolvedValue(),
        endSession: vi.fn().mockResolvedValue(), commitTransaction: vi.fn() };
    const findOne = vi.fn().mockResolvedValue({ _id: 'discarded' });
    const db = { collection: vi.fn(() => ({ findOne })) };
    const database = { connection: { db }, startSession: vi.fn().mockResolvedValue(session) };
    return { database, db, session, findOne };
}

describe('Checkout transaction readiness', () => {
    it('executes a bounded transaction read, aborts it, and ends the session without committing', async () => {
        const { database, db, session, findOne } = fixture();
        const verify = createCheckoutTransactionPreflight();
        await expect(verify(database)).resolves.toBeUndefined();
        expect(db.collection).toHaveBeenCalledWith('checkoutsessions');
        expect(session.startTransaction).toHaveBeenCalledWith({ readConcern: { level: 'snapshot' }, readPreference: 'primary' });
        expect(findOne).toHaveBeenCalledWith({}, { session, projection: { _id: 1 }, maxTimeMS: 5000 });
        expect(session.startTransaction.mock.invocationCallOrder[0]).toBeLessThan(findOne.mock.invocationCallOrder[0]);
        expect(findOne.mock.invocationCallOrder[0]).toBeLessThan(session.abortTransaction.mock.invocationCallOrder[0]);
        expect(session.abortTransaction.mock.invocationCallOrder[0]).toBeLessThan(session.endSession.mock.invocationCallOrder[0]);
        expect(session.commitTransaction).not.toHaveBeenCalled();
    });

    it('caches success for 60 seconds, separately for each database connection', async () => {
        const first = fixture(), second = fixture();
        let time = 1000;
        const verify = createCheckoutTransactionPreflight({ now: () => time });
        await verify(first.database);
        time = 60999;
        await verify(first.database);
        expect(first.findOne).toHaveBeenCalledTimes(1);
        await verify(second.database);
        expect(second.findOne).toHaveBeenCalledTimes(1);
        time = 61000;
        await verify(first.database);
        expect(first.findOne).toHaveBeenCalledTimes(2);
    });

    it('forces a fresh admin probe and invalidates cached success if that probe fails', async () => {
        const { database, findOne, session } = fixture();
        const verify = createCheckoutTransactionPreflight();
        await verify(database);
        findOne.mockRejectedValueOnce(new Error('mongodb://private-host credentials'));
        await expect(verify(database, { force: true })).rejects.toMatchObject({ code: 'checkout_transaction_unavailable', status: 503 });
        await verify(database);
        expect(findOne).toHaveBeenCalledTimes(3);
        expect(session.abortTransaction).toHaveBeenCalledTimes(3);
        expect(session.endSession).toHaveBeenCalledTimes(3);
    });

    it('does not cache unsupported transactions or expose the database error', async () => {
        const { database, findOne, session } = fixture();
        const verify = createCheckoutTransactionPreflight();
        findOne.mockRejectedValue(new Error('Transaction numbers require replica sets; secret-host'));
        for (let i = 0; i < 2; i++) {
            await expect(verify(database)).rejects.toThrow(CheckoutTransactionUnavailableError);
        }
        expect(findOne).toHaveBeenCalledTimes(2);
        expect(session.abortTransaction).toHaveBeenCalledTimes(2);
        expect(session.endSession).toHaveBeenCalledTimes(2);
        await expect(verify(database)).rejects.not.toThrow('secret-host');
    });

    it.each(['abortTransaction', 'endSession'])('fails closed if %s fails and retries next time', async method => {
        const { database, session, findOne } = fixture();
        const verify = createCheckoutTransactionPreflight();
        session[method].mockRejectedValueOnce(new Error('Cleanup failed'));
        await expect(verify(database)).rejects.toThrow(CheckoutTransactionUnavailableError);
        await verify(database);
        expect(findOne).toHaveBeenCalledTimes(2);
        expect(session.endSession).toHaveBeenCalledTimes(2);
    });

    it('cleans up a session whose transaction could not start', async () => {
        const { database, session, findOne } = fixture();
        session.startTransaction.mockImplementation(() => { throw new Error('Unsupported'); });
        await expect(createCheckoutTransactionPreflight()(database)).rejects.toThrow(CheckoutTransactionUnavailableError);
        expect(findOne).not.toHaveBeenCalled();
        expect(session.abortTransaction).not.toHaveBeenCalled();
        expect(session.endSession).toHaveBeenCalledTimes(1);
    });

    it('rejects a missing database or unavailable session without a successful cache entry', async () => {
        const { database } = fixture();
        const verify = createCheckoutTransactionPreflight();
        await expect(verify(undefined)).rejects.toThrow(CheckoutTransactionUnavailableError);
        database.startSession.mockRejectedValueOnce(new Error('No connection'));
        await expect(verify(database)).rejects.toThrow(CheckoutTransactionUnavailableError);
        await verify(database);
        expect(database.startSession).toHaveBeenCalledTimes(2);
    });
});
