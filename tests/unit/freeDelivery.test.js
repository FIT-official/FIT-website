import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyFreeStandardDelivery, discountedOrderSubtotalCents, isFreeStandardDelivery } from '@/lib/shipping/freeDelivery';
import { standardShippingTier } from '@/lib/shipping/weightTiers';
import { applyShopShipping } from '@/lib/shopShipping';
import { calculateCartItemBreakdown } from '@/app/api/checkout/calculateBreakdown';

const product = { _id: 'sensor', productType: 'shop', slug: 'hcsr04-ultrasonic-sensor',
    basePrice: { presentmentAmount: 205, presentmentCurrency: 'SGD' },
    delivery: { deliveryTypes: [{ type: 'standard-shipping', price: 999 }, { type: 'express-courier', price: 30 }, { type: 'pick-up', price: 0 }] } };

describe('no order-value delivery waiver', () => {
    it.each([[20000, false], [20001, false], [99999999, false], [2500, false], [null, false], [NaN, false], [20000.1, false]])('subtotal %s cents qualifies: %s', (cents, free) => {
        expect(isFreeStandardDelivery(cents)).toBe(free);
    });
    it.each(['letterbox', 'speedpost', 'bulky'])('preserves the paid %s tier and metadata above the old threshold', tier => {
        const quote = { tier, priceCents: 1230, blocked: false, description: 'Tracked' };
        expect(applyFreeStandardDelivery(quote, 20000)).toMatchObject({ priceCents: 1230, freeDeliveryApplied: false });
        expect(applyFreeStandardDelivery(quote, 20001)).toMatchObject({ tier, priceCents: 1230, freeDeliveryApplied: false, description: 'Tracked' });
        expect(quote.priceCents).toBe(1230);
    });
    it.each(['express-courier', 'pick-up', 'quote'])('never waives the %s service', tier => {
        expect(applyFreeStandardDelivery({ tier, priceCents: 3000, blocked: tier === 'quote' }, 30000)).toMatchObject({ priceCents: 3000, freeDeliveryApplied: false });
    });
    it.each([[205, 200, 6.2], [205.01, 200.01, 6.2]])('applies the S$5 discount before checking a S$%s order', async (base, price, fee) => {
        const p = { ...product, basePrice: { ...product.basePrice, presentmentAmount: base }, discounts: [{ percentage: 5 / base * 100 }] };
        const breakdown = await calculateCartItemBreakdown({ product: p, item: { quantity: 1, chosenDeliveryType: 'standard-shipping', price: 1000, deliveryFee: 0 } });
        applyShopShipping([{ product: p, breakdown }]);
        expect(breakdown).toMatchObject({ price, deliveryFee: fee, total: price + fee, freeDeliveryApplied: fee === 0 });
    });
    it.each([
        [{ shippingWeightG: 31000 }, true, 'quote'],
        [{ shippingDims: { L: 1600, W: 400, H: 300 } }, true, 'quote'],
        [{ shippingDims: { L: 700, W: 400, H: 300 } }, false, 'bulky'],
        [{}, false, 'speedpost'],
        [{ shippingDataFlag: 'MISSING' }, false, 'speedpost'],
    ])('preserves paid tier amounts and quote limits above the old threshold: %j', (overrides, blocked, tier) => {
        expect(standardShippingTier([{ product: { ...product, ...overrides }, quantity: 1 }], 20001))
            .toMatchObject({ tier, blocked, priceCents: blocked ? null : tier === 'bulky' ? 1230 : 620, freeDeliveryApplied: false });
    });
    it('keeps standard and Express paid in a mixed-method order while preserving pickup', async () => {
        const lines = await Promise.all(['standard-shipping', 'express-courier', 'pick-up'].map(async type => {
            const p = { ...product, basePrice: { ...product.basePrice, presentmentAmount: 75 } };
            return { product: p, breakdown: await calculateCartItemBreakdown({ product: p, item: { quantity: 1, chosenDeliveryType: type } }) };
        }));
        expect(discountedOrderSubtotalCents(lines)).toBe(22500);
        applyShopShipping(lines);
        expect(lines.map(line => line.breakdown.deliveryFee)).toEqual([6.2, 30, 0]);
        expect(lines.map(line => line.breakdown.freeDeliveryApplied)).toEqual([false, false, false]);
    });
    it.each([{ currency: 'USD' }, { price: NaN }, { price: -1 }, { quantity: 0 }, { quantity: 1.5 }])('rejects an invalid SGD subtotal: %j', overrides => {
        expect(discountedOrderSubtotalCents([{ breakdown: { price: 250, quantity: 1, currency: 'SGD', ...overrides } }])).toBeNull();
    });
});

it('contains no obsolete shipping copy or threshold logic in application sources', () => {
    const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
        entry.isDirectory() ? files(resolve(dir, entry.name)) : /\.(js|jsx|ts|tsx|mdx|json)$/.test(entry.name) ? [resolve(dir, entry.name)] : []);
    const failures = ['app', 'components', 'lib', 'content'].flatMap(root => files(resolve(root))).filter(file =>
        /Free delivery on orders over|S\$20(?!\d)|FREE_DELIVERY_MINIMUM|FREE_DELIVERY_MARGIN|freeShippingThreshold|PAYMENT_ALLOWANCE_PERCENT/.test(readFileSync(file, 'utf8')));
    expect(failures).toEqual([]);
}, 30000);
