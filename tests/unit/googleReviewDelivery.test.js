import { describe, expect, it } from 'vitest';
import { addSingaporeWorkingDays } from '@/lib/singaporeWorkingDays';
import { estimateGoogleReviewDelivery, snapshotGoogleReviewAvailability, REVIEW_DELIVERY_POLICY } from '@/lib/googleReviewDelivery';
import { buildCheckoutItem } from '@/lib/checkoutSnapshot';

describe('approved Singapore working-day delivery policy', () => {
    it.each([
        ['2026-09-30T12:00:00Z', 5, '2026-10-07'],
        ['2026-09-30T16:30:00Z', 5, '2026-10-08'], // Already 1 October in Singapore.
        ['2026-10-02T02:00:00Z', 5, '2026-10-09'],
        ['2026-10-03T02:00:00Z', 5, '2026-10-09'],
        ['2026-09-30T12:00:00Z', 14, '2026-10-20'],
        ['2026-11-06T02:00:00Z', 5, '2026-11-16'], // Deepavali observed Monday.
        ['2026-12-24T02:00:00Z', 5, '2027-01-04'], // Christmas and New Year.
        ['2027-02-05T02:00:00Z', 5, '2027-02-15'], // CNY observed Monday.
        ['2027-03-09T02:00:00Z', 5, '2027-03-17'], // Hari Raya Puasa.
    ])('counts after paid confirmation %s + %i days as %s', (from, days, expected) => {
        expect(addSingaporeWorkingDays(from, days)).toBe(expected);
    });
    it('fails closed on an unknown holiday year or invalid date/count', () => {
        for (const [from, days] of [['2027-12-30T00:00:00Z', 5], ['2028-01-01T00:00:00Z', 5], ['invalid', 5], [null, 5], ['2026-10-01', 0]])
            expect(addSingaporeWorkingDays(from, days)).toBeNull();
    });
});
const state = value => ({ state: value, policy: REVIEW_DELIVERY_POLICY, source: 'fixture-verified-stock' });
const checkout = states => ({ shippingAddress: { country: 'SG' }, items: states.map(value => ({ chosenDeliveryType: 'standard-shipping', googleReviewAvailability: state(value) })) });
describe('immutable availability and conservative order estimates', () => {
    it('uses 14 days for a mixed stock/preorder shipment, and 5 for all stock', () => {
        const confirmedAt = '2026-09-30T12:00:00Z';
        expect(estimateGoogleReviewDelivery({ checkout: checkout(['in_stock', 'preorder']), confirmedAt })?.date).toBe('2026-10-20');
        expect(estimateGoogleReviewDelivery({ checkout: checkout(['in_stock', 'in_stock']), confirmedAt })?.date).toBe('2026-10-07');
    });
    it('never guesses missing status, pickup/digital/unknown delivery type, overseas timing or legacy policy', () => {
        const base = checkout(['in_stock']); const confirmedAt = '2026-09-30T12:00:00Z';
        for (const candidate of [checkout(['in_stock', 'unknown']), { ...base, shippingAddress: { country: 'MY' } },
            { ...base, items: [{ chosenDeliveryType: 'digital', googleReviewAvailability: state('in_stock') }] },
            { ...base, items: [{ chosenDeliveryType: 'pickup', googleReviewAvailability: state('in_stock') }] },
            { ...base, items: [{ chosenDeliveryType: 'shipping' }] },
            { ...base, items: [{ chosenDeliveryType: 'shipping', googleReviewAvailability: { ...state('in_stock'), policy: 'legacy' } }] }])
            expect(estimateGoogleReviewDelivery({ checkout: candidate, confirmedAt })).toBeNull();
    });
    it('does not interpret unlimited or missing stock as physical stock or preorder', () => {
        const args = { product: { productType: 'shop', listing: 'fit', infiniteStock: true }, item: {}, quantity: 2, chosenDeliveryType: 'shipping' };
        expect(snapshotGoogleReviewAvailability(args).state).toBe('unknown');
        expect(snapshotGoogleReviewAvailability({ ...args, product: { ...args.product, infiniteStock: false } }).state).toBe('unknown');
    });
    it('requires every exact selected option to be known before using numeric stock', () => {
        const product = { productType: 'shop', listing: 'fit', stock: 10, variantTypes: [
            { name: 'Colour', options: [{ name: 'Blue', stock: 3 }] }, { name: 'Spool', options: [{ name: 'With Spool' }] }] };
        const args = { product, item: { selectedVariants: { Colour: 'Blue', Spool: 'With Spool' } }, quantity: 2, chosenDeliveryType: 'shipping' };
        expect(snapshotGoogleReviewAvailability(args).state).toBe('unknown');
        product.variantTypes[1].options[0].stock = 2;
        expect(snapshotGoogleReviewAvailability(args).state).toBe('in_stock');
        product.variantTypes[0].options[0].stock = 0;
        expect(snapshotGoogleReviewAvailability(args).state).toBe('unknown');
    });
    it('accepts explicit verified preorder classification, never a mere text description', () => {
        const product = { productType: 'shop', listing: 'fit', infiniteStock: true, description: 'preorder' };
        const args = { product, item: {}, quantity: 2, chosenDeliveryType: 'shipping' };
        expect(snapshotGoogleReviewAvailability(args).state).toBe('unknown');
        product.googleReviewAvailability = { state: 'preorder', source: 'verified-owner-record', verifiedAt: '2026-10-01T00:00:00Z' };
        expect(snapshotGoogleReviewAvailability(args).state).toBe('preorder');
    });
    it('captures stock at checkout and does not accept a client-supplied override or later inventory', () => {
        const product = { _id: 'p1', slug: 'fixture', name: 'Fixture', productType: 'shop', listing: 'fit', stock: 5 };
        const snapshot = buildCheckoutItem({ product, item: { _id: 'c1', googleReviewAvailability: state('preorder') },
            breakdown: { price: 25.9, quantity: 2, deliveryFee: 5, currency: 'SGD', chosenDeliveryType: 'shipping' } });
        expect(snapshot.googleReviewAvailability.state).toBe('in_stock');
        product.stock = 0; product.googleReviewAvailability = { state: 'preorder' };
        expect(estimateGoogleReviewDelivery({ checkout: { shippingAddress: { country: 'SG' }, items: [snapshot] }, confirmedAt: '2026-09-30T12:00:00Z' })?.date).toBe('2026-10-07');
    });
});
