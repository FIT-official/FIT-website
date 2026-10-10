import { describe, expect, it } from 'vitest';
import { calculateCartItemBreakdown } from '@/app/api/checkout/calculateBreakdown';
import { defaultCartDelivery } from '@/lib/cartDelivery';
import { applyShopShipping, usesWeightShipping } from '@/lib/shopShipping';
import { discountedOrderSubtotalCents } from '@/lib/shipping/freeDelivery';
import { isNonShippableProduct, standardShippingTier } from '@/lib/shipping/weightTiers';

const service = { _id: 'repair', slug: '3d-printer-repair-maintenance', productType: 'shop', listing: 'fit',
    basePrice: { presentmentAmount: 30, presentmentCurrency: 'SGD' },
    delivery: { deliveryTypes: [{ type: 'pick-up', price: 0 }] } };
async function line(product, chosenDeliveryType = defaultCartDelivery(product)) {
    return { product, breakdown: await calculateCartItemBreakdown({ product, item: { quantity: 1, chosenDeliveryType } }) };
}
function goods(slug, price) {
    return { _id: slug, slug, productType: 'shop', listing: 'fit', basePrice: { presentmentAmount: price, presentmentCurrency: 'SGD' },
        delivery: { deliveryTypes: [{ type: 'standard-shipping', price: 6.2 }] } };
}

describe('non-shippable services', () => {
    it.each([{ productType: 'SERVICE' }, { categoryId: 'Services' }, { category: ' service ' }, service])('recognizes an explicit service marker: %j', product => {
        expect(isNonShippableProduct(product)).toBe(true);
        expect(usesWeightShipping(product)).toBe(false);
        expect(standardShippingTier([{ product, quantity: 1 }], 3000)).toMatchObject({ tier: 'none', priceCents: 0, blocked: false, freeDeliveryApplied: false });
    });
    it.each([{ productType: 'shop', category: 2, subcategory: 3 }, { productType: 'shop', categoryId: 'Printer', subcategoryId: 'Maintenance' }])('keeps physical maintenance parts shippable: %j', product => {
        expect(isNonShippableProduct(product)).toBe(false);
        expect(usesWeightShipping(product)).toBe(true);
        expect(standardShippingTier([{ product, quantity: 1 }], 3000).reason).toBe('missing-shipping-data');
    });
    it('preserves the only configured option for a service-only cart without a tier charge', async () => {
        const original = structuredClone(service);
        const item = await line(service);
        expect(applyShopShipping([item])).toBe(false);
        expect(item.breakdown).toMatchObject({ chosenDeliveryType: 'pick-up', deliveryFee: 0, total: 30, shippingBlocked: false });
        expect(item.breakdown.standardShipping).toBeUndefined();
        expect(service).toEqual(original);
        await expect(line(service, 'standard-shipping')).rejects.toThrow(/Unknown delivery type/);
    });
    it.each([0, 4])('preserves an already configured Standard service fee of %s without a missing-data fallback', async fee => {
        const item = await line({ ...service, delivery: { deliveryTypes: [{ type: 'standard-shipping', price: fee }] } });
        applyShopShipping([item]);
        expect(item.breakdown).toMatchObject({ deliveryFee: fee, total: 30 + fee, shippingBlocked: false });
        expect(item.breakdown.standardShipping).toBeUndefined();
    });
    it.each([['hcsr04-ultrasonic-sensor', 1.65, 2], ['bambu-lab-3d-printing-filament-1kg-pla-basic', 21.9, 6.2]])('ignores the S$30 service when pricing %s', async (slug, price, fee) => {
        const lines = [await line(service), await line(goods(slug, price))];
        applyShopShipping(lines);
        expect(lines.map(item => item.breakdown.deliveryFee)).toEqual([0, fee]);
        expect(lines[1].breakdown.standardShipping.reason).not.toBe('missing-shipping-data');
        expect(discountedOrderSubtotalCents(lines)).toBe(Math.round((30 + price) * 100));
    });
    it('ignores service weight, dimensions and missing flags even when selected as Standard', async () => {
        const marked = { ...service, shippingWeightG: 40000, shippingDims: { L: 2000, W: 2000, H: 2000 }, shippingDataFlag: 'MISSING',
            delivery: { deliveryTypes: [{ type: 'standard-shipping', price: 0 }] } };
        const sensor = goods('hcsr04-ultrasonic-sensor', 1.65);
        expect(standardShippingTier([{ product: marked, quantity: 1 }, { product: sensor, quantity: 1 }], 3165, 165))
            .toMatchObject({ tier: 'letterbox', priceCents: 200, blocked: false });
        const lines = [await line(marked), await line(sensor)];
        applyShopShipping(lines);
        expect(lines.map(item => item.breakdown.deliveryFee)).toEqual([0, 2]);
        expect(lines[0].breakdown.shippingBlocked).toBe(false);
    });
    it.each([[203.35, 20000, 2], [203.36, 20001, 2]])('keeps the parcel paid when a discounted service crosses the old S$200 boundary (%s before discount)', async (base, cents, fee) => {
        const discounted = { ...service, basePrice: { ...service.basePrice, presentmentAmount: base }, discounts: [{ percentage: 5 / base * 100 }] };
        const lines = [await line(discounted), await line(goods('hcsr04-ultrasonic-sensor', 1.65))];
        expect(lines[0].breakdown.price).toBeCloseTo(base - 5);
        expect(discountedOrderSubtotalCents(lines)).toBe(cents);
        applyShopShipping(lines);
        expect(lines.map(item => item.breakdown.deliveryFee)).toEqual([0, fee]);
    });
});
