import { describe, expect, it } from 'vitest';
import CheckoutSession from '@/models/CheckoutSession';

const receipt = () => ({ reason: 'legacy_snapshot_missing', paymentStatus: 'paid', amountTotalCents: 2500,
    currency: 'sgd', paymentIntentId: 'pi_paid', stripeEventId: 'evt_paid', recordedAt: new Date(), eventCreatedAt: new Date(),
    expectedAmountCents: 2500, expectedCurrency: 'sgd', amountMismatch: false, currencyMismatch: false });

describe('legacy reconciliation receipt schema', () => {
    it('accepts a review status and payment receipt without creating a purchase snapshot', () => {
        const doc = new CheckoutSession({ sessionId: 'cs_old', userId: 'buyer', totalAmount: 2500,
            status: 'reconciliation_required', reconciliation: receipt() });
        expect(doc.validateSync()).toBeUndefined();
        expect(doc.items).toBeUndefined(); expect(doc.snapshotVersion).toBeUndefined();
        expect(CheckoutSession.schema.path('reconciliation').options.immutable).toBe(true);
    });
    it('rejects fractional or negative captured cents and unverified payment states', () => {
        for (const patch of [{ amountTotalCents: 1.5 }, { amountTotalCents: -1 }, { paymentStatus: 'unpaid' }]) {
            const doc = new CheckoutSession({ sessionId: 'cs_old', userId: 'buyer', totalAmount: 2500,
                status: 'reconciliation_required', reconciliation: { ...receipt(), ...patch } });
            expect(doc.validateSync()).toBeDefined();
        }
    });
});
