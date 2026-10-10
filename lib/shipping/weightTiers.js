import weights from '../../data/shipping/product-weights.v1.json';
import { applyFreeStandardDelivery } from './freeDelivery';

export const DELIVERY_QUOTE_MESSAGE = 'Contact us for a delivery quote';
export const LETTERBOX_DESCRIPTION = 'Tracked, delivered to your letterbox (SingPost Tracked Letterbox)';
export const SPEEDPOST_DESCRIPTION = 'Tracked, next working day (SingPost Speedpost)';

/**
 * Resolve server-owned Product measurements in grams/mm. Each present database
 * field takes precedence; null/undefined fields use the versioned slug entry.
 * Invalid present values are not replaced with estimates: they trigger fallback.
 * No database access occurs in this module.
 * @param {object} product
 * @returns {{weight_g: number, L_mm: number, W_mm: number, H_mm: number, flag: string}}
 */
export function productShippingData(product = {}) {
    const entry = weights.products[product.slug] || {};
    return {
        weight_g: product.shippingWeightG ?? entry.weight_g,
        L_mm: product.shippingDims?.L ?? entry.L_mm,
        W_mm: product.shippingDims?.W ?? entry.W_mm,
        H_mm: product.shippingDims?.H ?? entry.H_mm,
        flag: product.shippingDataFlag ?? entry.flag,
    };
}

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const sorted = dims => [...dims].sort((a, b) => a - b);
const fits = (dims, box) => sorted(dims).every((value, i) => value <= sorted(box)[i]);
const result = (tier, priceCents, label, description, reason, blocked = false) =>
    ({ tier, priceCents, label, description, reason, blocked });
const quote = reason => result('quote', null, 'Standard delivery', DELIVERY_QUOTE_MESSAGE, reason, true);
const speedpost = reason => result('speedpost', 620, 'Speedpost Standard', SPEEDPOST_DESCRIPTION, reason);

/**
 * Price ONE combined standard shipment, using integer cents for the subtotal.
 * Conservative stacking: sort each item's dimensions, stack its smallest
 * dimension times quantity, and take the maximum middle and largest dimensions
 * as the footprint. Add 10 mm to EACH resulting dimension for the mailer, or
 * 20 mm for the carton, then compare sorted packed and box dimensions. This is
 * an allowance on each dimension (not twice the allowance), not volume packing.
 * All values are estimates unless measured data has been supplied by the caller.
 * Known goods weight + 200 g over 30 kg blocks even if other data is missing.
 * Otherwise ANY incomplete/MISSING line uses the S$6.20 fallback; no size is
 * invented for it. Invalid quantities block rather than undercount the parcel.
 * @param {Array<{product: object, quantity: number}>} lines Server-owned products.
 * @param {number} subtotalCents Order merchandise subtotal after discounts.
 * @returns {{tier: string, priceCents: number|null, label: string, description: string, reason: string, blocked: boolean}}
 */
export function standardShippingTier(lines, subtotalCents) {
    return applyFreeStandardDelivery(packedStandardShippingTier(lines, subtotalCents), subtotalCents);
}

function packedStandardShippingTier(lines, subtotalCents) {
    let goodsWeight = 0, height = 0, middle = 0, largest = 0, missing = !lines.length;
    for (const { product, quantity } of lines) {
        if (!Number.isSafeInteger(quantity) || quantity < 1) return quote('invalid-quantity');
        const data = productShippingData(product);
        if (positive(data.weight_g)) goodsWeight += data.weight_g * quantity;
        const dims = [data.L_mm, data.W_mm, data.H_mm];
        if (data.flag === 'MISSING' || !positive(data.weight_g) || !dims.every(positive)) missing = true;
        if (dims.every(positive)) {
            const [small, medium, large] = sorted(dims);
            height += small * quantity;
            middle = Math.max(middle, medium);
            largest = Math.max(largest, large);
        }
    }
    if (goodsWeight + 200 > 30000) return quote('over-30kg');
    if (missing) return speedpost('missing-shipping-data');
    const packed = [height, middle, largest];
    if (goodsWeight + 50 <= 2000 && fits(packed.map(n => n + 10), [324, 229, 65]) &&
        Number.isSafeInteger(subtotalCents) && subtotalCents >= 0 && subtotalCents <= 3000) {
        return result('letterbox', 200, 'Tracked Letterbox', LETTERBOX_DESCRIPTION, 'letterbox-limits');
    }
    const carton = packed.map(n => n + 20);
    if (fits(carton, [600, 400, 300])) return speedpost('standard-limits');
    const [H, W, L] = sorted(carton);
    if (L <= 1500 && L + 2 * W + 2 * H <= 3000) {
        return result('bulky', 1230, 'Bulky delivery', SPEEDPOST_DESCRIPTION, 'bulky-limits');
    }
    return quote('above-bulky-limits');
}
