// @vitest-environment node
import { expect, it } from 'vitest';
import { calculatePayout, feeCents, legacyPriceCents, subOrderPayout, summarizePayouts } from '@/lib/creator/payoutMath';
import { payoutConfig } from '@/lib/creator/payoutConfig';
it('calculates gross less estimated Stripe and FIT fees in integer cents', () => {
    expect(calculatePayout(10000)).toEqual({ grossCents: 10000, stripeFeeCents: 390, platformFeeCents: 1000, creatorNetCents: 8610 });
});
it('rounds half cents up and calculates once per sub-order', () => {
    expect(feeCents(5, 1000)).toBe(1); expect(feeCents(4, 1000)).toBe(0);
    expect(subOrderPayout({ _id: 'A', items: [{ qty: 3, unitAmountCents: 5 }] }).platformFeeCents).toBe(2);
});
it('configures the placeholder formula and preserves negative net for tiny orders', () => {
    expect(calculatePayout(1000, { ...payoutConfig, platformBasisPoints: 500, stripeBasisPoints: 200, stripeFixedCents: 30 })).toEqual({ grossCents: 1000, platformFeeCents: 50, stripeFeeCents: 50, creatorNetCents: 900 });
    expect(calculatePayout(1).creatorNetCents).toBe(-49); expect(calculatePayout(0).stripeFeeCents).toBe(0);
});
it('converts legacy decimal prices exactly and prefers stored cents', () => {
    expect(legacyPriceCents(1.01)).toBe(101); expect(legacyPriceCents('21.90')).toBe(2190);
    expect(subOrderPayout({ _id: 'A', items: [{ qty: 3, price: 1.01 }, { qty: 1, unitAmountCents: 10, price: 999 }] }).grossCents).toBe(313);
    expect(() => legacyPriceCents(1.001)).toThrow('precision');
});
it('sums rounded sub-order rows exactly and excludes cancelled and refunded sales', () => {
    const result = summarizePayouts(['paid', 'qc', 'refunded', 'cancelled'].map((status, n) => ({ _id: n, status, items: [{ qty: 1, unitAmountCents: 333 }] })));
    expect(result.rows[2]).toMatchObject({ excluded: true, grossCents: 0, creatorNetCents: 0 });
    for (const key of Object.keys(result.totals)) expect(result.totals[key]).toBe(result.rows.reduce((sum, row) => sum + row[key], 0));
    expect(result.totals.grossCents - result.totals.platformFeeCents - result.totals.stripeFeeCents).toBe(result.totals.creatorNetCents);
});
it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid cents %s', gross => {
    expect(() => calculatePayout(gross)).toThrow(RangeError);
});
it('rejects invalid fee rates, quantities and overflow', () => {
    expect(() => feeCents(10, 10001)).toThrow(RangeError);
    expect(() => subOrderPayout({ items: [{ qty: -1, price: 1 }] })).toThrow(RangeError);
    expect(() => subOrderPayout({ items: [{ qty: 2, unitAmountCents: Number.MAX_SAFE_INTEGER }] })).toThrow(RangeError);
});
