import { describe, expect, it } from 'vitest';
import { allocateLines, selectedAvailability, RESTOCKING_DISCLOSURE } from '@/lib/shopBackorders/policy';
import { mapProductToForm, buildProductPayload } from '@/utils/formHelpers/productFormHelpers';
import { editableProduct, productForViewer } from '@/lib/productAccess';
const product = () => ({ _id: 'p', productType: 'shop', stock: 5, variantTypes: [{ name: 'Colour', options: [{ name: 'Blue', stock: 3 }, { name: 'Red', stock: 4 }] }] });
const line = (quantity, colour = 'Blue', id = 'a') => ({ _id: id, productId: 'p', quantity, selectedVariants: { Colour: colour }, chosenDeliveryType: 'shipping' });
describe('Shop backorder allocation policy', () => {
    it('preserves owner-entered restock policy through the existing editor and keeps allocation fences private', () => {
        const input = { ...product(), restockStatus: 'expected', backorderRevision: 7, images: [], paidAssets: [], dimensions: {} };
        input.variantTypes[0].options[0].restockStatus = 'not_restocked';
        const payload = buildProductPayload(mapProductToForm(input, {}), null, [], [], null);
        expect(editableProduct(payload)).toMatchObject({ restockStatus: 'expected', variantTypes: [{ options: [expect.objectContaining({ restockStatus: 'not_restocked' }), expect.any(Object)] }] });
        expect(productForViewer(input, null)).not.toHaveProperty('backorderRevision');
        expect(editableProduct(input)).not.toHaveProperty('backorderRevision');
    });
    it('splits cumulative duplicate variants and shared product pools without inventing stock', () => {
        const p = product();
        const result = allocateLines([line(2), line(3, 'Blue', 'b'), line(4, 'Red', 'c')], [p]);
        expect(result.map(x => [x.onHandQuantity, x.backorderQuantity])).toEqual([[2, 0], [1, 2], [2, 2]]);
        expect(p.stock).toBe(5);
        expect(result[1].disclosure).toBe(RESTOCKING_DISCLOSURE);
    });
    it('subtracts only actual active allocations, never backorder units', () => {
        const result = allocateLines([line(3)], [product()], [{ productId: 'p', selectedVariants: { Colour: 'Blue' }, onHandQuantity: 1, backorderQuantity: 10 }]);
        expect(result[0]).toMatchObject({ availableQuantity: 2, onHandQuantity: 2, backorderQuantity: 1 });
    });
    it('allows a sold-out selection with the conditional disclosure', () => {
        const p = product(); p.stock = 0;
        expect(allocateLines([line(2)], [p])[0]).toMatchObject({ blocked: false, onHandQuantity: 0, backorderQuantity: 2 });
        expect(RESTOCKING_DISCLOSURE).toBe('Restocking the remaining items may take 3–6 weeks. If an item won’t be restocked, we’ll inform you.');
    });
    it.each(['product', 'option'])('blocks excess for a known non-restockable %s', level => {
        const p = product(); (level === 'product' ? p : p.variantTypes[0].options[0]).restockStatus = 'not_restocked';
        expect(allocateLines([line(4)], [p])[0].blocked).toBe(true);
        expect(allocateLines([line(3)], [p])[0].blocked).toBe(false);
    });
    it.each([{}, { infiniteStock: true }])('does not turn unknown/infinite stock into an available count: %j', extra => {
        const p = { _id: 'p', productType: 'shop', ...extra };
        expect(allocateLines([{ ...line(2), selectedVariants: {} }], [p])[0]).toMatchObject({ blocked: true, availableQuantity: null });
    });
    it.each([0, -1, 1.5, 101, NaN])('rejects invalid quantity %s', n => expect(() => allocateLines([line(n)], [product()])).toThrow());
    it('does not allocate a removed or missing variant', () => {
        expect(selectedAvailability(product(), {}).available).toBeNull();
        expect(allocateLines([line(2, 'Removed')], [product()])[0].blocked).toBe(true);
    });
    it('blocks a hidden item for new checkout but can fulfill its previously paid quantities', () => {
        const p = { ...product(), hidden: true };
        expect(() => allocateLines([line(2)], [p])).toThrow();
        expect(allocateLines([line(2)], [p], [], { fulfillment: true })[0].onHandQuantity).toBe(2);
    });
    it('uses a Map selection and keeps nonphysical print/payment behavior unchanged', () => {
        expect(selectedAvailability(product(), new Map([['Colour', 'Blue']])).available).toBe(3);
        expect(allocateLines([{ ...line(2), chosenDeliveryType: 'digital' }], [product()])).toEqual([null]);
        expect(allocateLines([line(2)], [{ ...product(), slug: '3d-printer-repair-maintenance' }])).toEqual([null]);
    });
});
