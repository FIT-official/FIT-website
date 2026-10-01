import { addSingaporeWorkingDays } from './singaporeWorkingDays';
import { isoCountryCode } from './isoCountryCodes';

export const REVIEW_DELIVERY_POLICY = 'fit-sg-5-or-14-working-days-2026-10-01';
const shipping = type => ['shipping', 'standard-shipping'].includes(type);

// Snapshot only authoritative server-side data for the exact chosen options.
// infiniteStock means unrestricted sale; it does not prove physical stock or preorder.
export function snapshotGoogleReviewAvailability({ product, item, quantity, chosenDeliveryType, customRequest }) {
    const unknown = { state: 'unknown', policy: REVIEW_DELIVERY_POLICY };
    if (!Number.isSafeInteger(quantity) || quantity < 1) return unknown;
    if (customRequest || product?.productType !== 'shop' || product.listing !== 'fit' || !shipping(chosenDeliveryType)) return unknown;
    const selected = item?.selectedVariants instanceof Map ? Object.fromEntries(item.selectedVariants) : item?.selectedVariants || {};
    const options = [];
    for (const type of product.variantTypes || []) {
        const option = type.options?.find(value => value.name === selected[type.name]);
        if (!option) return unknown;
        options.push(option);
    }
    const counts = [product.stock, ...options.map(option => option.stock)].filter(count => count !== undefined && count !== null);
    if (!product.infiniteStock && counts.some(count => !Number.isSafeInteger(count) || count < quantity)) return unknown;
    const verified = product.googleReviewAvailability;
    if (['in_stock', 'preorder'].includes(verified?.state) && typeof verified.source === 'string' && verified.source.trim() &&
        verified.verifiedAt && Number.isFinite(new Date(verified.verifiedAt).getTime())) {
        return { state: verified.state, policy: REVIEW_DELIVERY_POLICY, source: 'verified-fulfilment-record' };
    }
    if (product.infiniteStock || !counts.length || options.some(option => !Number.isSafeInteger(option.stock))) return unknown;
    return { state: 'in_stock', policy: REVIEW_DELIVERY_POLICY, source: 'checkout-product-and-option-stock' };
}

export function estimateGoogleReviewDelivery({ checkout, confirmedAt }) {
    if (isoCountryCode(checkout?.shippingAddress?.country) !== 'SG' || !checkout?.items?.length) return null;
    let days = 5;
    for (const item of checkout.items) {
        const availability = item.googleReviewAvailability;
        if (!shipping(item.chosenDeliveryType) || availability?.policy !== REVIEW_DELIVERY_POLICY ||
            !availability.source || !['in_stock', 'preorder'].includes(availability.state)) return null;
        if (availability.state === 'preorder') days = 14; // Entire mixed order uses the longer estimate.
    }
    const date = addSingaporeWorkingDays(confirmedAt, days);
    if (!date) return null;
    return { date, source: REVIEW_DELIVERY_POLICY, verifiedAt: new Date(confirmedAt) };
}
