import { describe, expect, it } from 'vitest';
import weights from '@/data/shipping/product-weights.v1.json';
import { standardShippingTier, productShippingData, DELIVERY_QUOTE_MESSAGE } from '@/lib/shipping/weightTiers';
import { buildWeights, parseCsv } from '@/scripts/shipping/build-weights.mjs';
import { applyShopShipping } from '@/lib/shopShipping';
import Product from '@/models/Product';

const product = (overrides = {}) => ({ shippingWeightG: 15, shippingDims: { L: 100, W: 80, H: 20 }, shippingDataFlag: 'ESTIMATED', ...overrides });
const rate = (p = product(), cents = 1000, quantity = 1) => standardShippingTier([{ product: p, quantity }], cents);
const slug = value => ({ slug: value });

describe('packed shipping tiers', () => {
    it.each([[1950, 200], [1951, 620]])('goods weight %s g includes the 50 g mailer', (weight, cents) => {
        expect(rate(product({ shippingWeightG: weight })).priceCents).toBe(cents);
    });
    it.each([[55, 200], [56, 620]])('stack height %s mm includes the 10 mm allowance', (height, cents) => {
        expect(rate(product({ shippingDims: { L: 100, W: 80, H: height } })).priceCents).toBe(cents);
    });
    it.each([[3000, 200], [3001, 620]])('subtotal %s integer cents', (subtotal, cents) => {
        expect(rate(product(), subtotal).priceCents).toBe(cents);
    });
    it('stacks quantities and mixed lines using sorted footprints, not total volume', () => {
        const small = product({ shippingDims: { L: 27, W: 219, H: 314 } });
        expect(rate(small, 1000, 2).priceCents).toBe(200);
        const lines = [{ product: small, quantity: 1 }, { product: product({ shippingDims: { L: 314, W: 219, H: 28 } }), quantity: 1 }];
        expect(standardShippingTier(lines, 1000).priceCents).toBe(200);
        lines[1].product.shippingDims.H = 29;
        expect(standardShippingTier(lines, 1000).priceCents).toBe(620);
    });
    it.each([
        { shippingWeightG: undefined },
        { shippingDims: { L: 100, W: 80 } },
        { shippingDataFlag: 'MISSING' },
        { shippingWeightG: 0 },
        { shippingDims: { L: 100, W: 80, H: NaN } },
    ])('falls back for incomplete or missing data: %j', overrides => {
        expect(rate(product(overrides))).toMatchObject({ priceCents: 620, reason: 'missing-shipping-data', blocked: false });
    });
    it.each(Object.entries(weights.products).filter(([, data]) => data.flag === 'MISSING').map(([key]) => [key]))('keeps missing entry %s at S$6.20', key => {
        expect(rate(slug(key)).priceCents).toBe(620);
    });
    it('prices sandpaper at Speedpost: width 230 + 10 > 229 mm', () => {
        expect(rate(slug('230mm-x-280mm-cw100')).priceCents).toBe(620);
    });
    it('uses the fallback for Foam Board', () => {
        expect(rate(slug('foam-board'))).toMatchObject({ priceCents: 620, reason: 'missing-shipping-data' });
    });
    it('combines a module and filament into one S$6.20 shipment', () => {
        expect(standardShippingTier([
            { product: slug('hcsr04-ultrasonic-sensor'), quantity: 1 },
            { product: slug('bambu-lab-3d-printing-filament-1kg-pla-basic'), quantity: 1 },
        ], 2355).priceCents).toBe(620);
    });
    it('moves light items over S$30 to Speedpost even if they fit', () => {
        expect(rate(slug('2pin-white-led'), 4400, 2).priceCents).toBe(620);
    });
    it.each([[29800, 620], [29801, null]])('includes the 200 g carton at 30 kg (%s g goods)', (weight, cents) => {
        expect(rate(product({ shippingWeightG: weight })).priceCents).toBe(cents);
    });
    it.each([
        [{ L: 580, W: 380, H: 280 }, 620],
        [{ L: 581, W: 380, H: 280 }, 1230],
        [{ L: 1480, W: 380, H: 330 }, 1230], // 1500 + 800 + 700 = 3000
        [{ L: 1481, W: 380, H: 330 }, null],
        [{ L: 1480, W: 381, H: 330 }, null],
    ])('checks carton and bulky length/girth limits: %j', (dims, cents) => {
        expect(rate(product({ shippingDims: dims })).priceCents).toBe(cents);
    });
    it('blocks known overweight even with another missing line', () => {
        expect(standardShippingTier([{ product: product({ shippingWeightG: 30000 }), quantity: 1 },
            { product: slug('foam-board'), quantity: 1 }], 5000)).toMatchObject({ blocked: true, priceCents: null, description: DELIVERY_QUOTE_MESSAGE });
    });
    it.each([0, -1, 1.5, NaN])('blocks invalid quantity %s', quantity => {
        expect(rate(product(), 1000, quantity).blocked).toBe(true);
    });
});

describe('shipping catalogue and overrides', () => {
    it('retains 200 entries, all 13 Bambu products and the missing service', () => {
        expect(Object.keys(weights.products)).toHaveLength(200);
        expect(Object.keys(weights.products).filter(key => key.startsWith('bambu-'))).toHaveLength(13);
        expect(Object.values(weights.products).filter(data => data.flag === 'MISSING')).toHaveLength(12);
        expect(weights.products['3d-printer-repair-maintenance']).toMatchObject({ flag: 'MISSING', weight_g: null });
    });
    it('prefers present database fields and falls back field by field', () => {
        const p = { slug: 'hcsr04-ultrasonic-sensor', shippingWeightG: 1951, shippingDims: { H: 40 } };
        expect(productShippingData(p)).toMatchObject({ weight_g: 1951, L_mm: 70, W_mm: 50, H_mm: 40, flag: 'ESTIMATED' });
        expect(rate(p).priceCents).toBe(620);
        expect(rate({ ...p, shippingDataFlag: 'MISSING' }).reason).toBe('missing-shipping-data');
        expect(rate({ ...p, shippingWeightG: 0 }).reason).toBe('missing-shipping-data');
    });
    it('adds optional measurements without defaults or a database write', () => {
        const doc = new Product();
        expect(doc.shippingWeightG).toBeUndefined();
        expect(doc.shippingDims).toBeUndefined();
        expect(doc.shippingDataFlag).toBeUndefined();
    });
    it('parses CSV quoting and produces deterministic nulls', () => {
        expect(parseCsv('a,b\r\n"two, words","say ""hi"""\r\n')).toEqual([{ a: 'two, words', b: 'say "hi"' }]);
        const csv = 'url,weight_g,L_mm,W_mm,H_mm,flag,source,notes\nhttps://www.fixitoday.com/products/foam-board,,,,,MISSING,none,measure\n';
        expect(buildWeights(csv)).toEqual({ version: 1, generatedFrom: 'PRODUCT_WEIGHTS.csv', products: {
            'foam-board': { weight_g: null, L_mm: null, W_mm: null, H_mm: null, flag: 'MISSING', source: 'none', notes: 'measure' },
        } });
        expect(() => buildWeights(csv + csv.split('\n')[1])).toThrow(/duplicate/);
    });
});

describe('combined standard shipping', () => {
    function line(key, price, quantity = 1, type = 'standard-shipping') {
        return { product: { slug: key, productType: 'shop', listing: 'fit' }, breakdown: {
            quantity, price, chosenDeliveryType: type, deliveryFee: type === 'express-courier' ? 30 : 0, currency: 'SGD',
        } };
    }
    it('charges a combined parcel once, including split variants/lines', () => {
        const lines = [line('hcsr04-ultrasonic-sensor', 1.65), line('bambu-lab-3d-printing-filament-1kg-pla-basic', 21.9)];
        expect(applyShopShipping(lines, null)).toBe(false);
        expect(lines.map(l => l.breakdown.deliveryFee)).toEqual([6.2, 0]);
        expect(lines[1].breakdown.standardShippingIncluded).toBe(true);
        expect(lines.reduce((sum, l) => sum + l.breakdown.total, 0)).toBeCloseTo(29.75);
    });
    it('charges the table rate for a high-margin S$25 order', () => {
        const item = line('2pin-white-led', 25);
        expect(applyShopShipping([item], { country: 'SG' })).toBe(false);
        expect(item.breakdown.deliveryFee).toBe(2);
        item.product.shippingCosts = { confirmed: true, unitCost: 1, packingCost: 1, deliveryCost: 2 };
        expect(applyShopShipping([item], { country: 'SG' })).toBe(false);
        expect(item.breakdown).toMatchObject({ deliveryFee: 2, total: 27, freeDeliveryApplied: false, standardShipping: { priceCents: 200 } });
    });
    it('does not waive a blocked shipment, but pickup remains available', () => {
        const item = line('overweight', 201);
        Object.assign(item.product, product({ shippingWeightG: 31000 }), { shippingCosts: { confirmed: true, unitCost: 1, packingCost: 1, deliveryCost: 2 } });
        expect(applyShopShipping([item], { country: 'SG' })).toBe(false);
        expect(item.breakdown).toMatchObject({ shippingBlocked: true, deliveryFee: null, total: null });
        item.breakdown.chosenDeliveryType = 'pick-up';
        item.breakdown.deliveryFee = 0;
        applyShopShipping([item], { country: 'SG' });
        expect(item.breakdown).toMatchObject({ shippingBlocked: false, deliveryFee: 0, total: 201 });
    });
    it('waives only Standard charges in a mixed order over S$200', () => {
        const lines = [line('hcsr04-ultrasonic-sensor', 1.65), line('overweight', 5, 99, 'pick-up'), line('overweight', 5, 99, 'express-courier')];
        const print = { ...line('print', 10), customRequest: true };
        print.breakdown.deliveryFee = 9;
        const creator = line('creator', 10);
        creator.product.listing = 'creator'; creator.breakdown.deliveryFee = 8;
        applyShopShipping([...lines, print, creator], null);
        expect(lines.map(l => l.breakdown.deliveryFee)).toEqual([0, 0, 30]);
        expect(print.breakdown.deliveryFee).toBe(0);
        expect(creator.breakdown.deliveryFee).toBe(0);
        expect(print.breakdown.standardShipping).toBeUndefined();
    });
});
