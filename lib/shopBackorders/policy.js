export const RESTOCKING_VERSION = 'fit-restocking-v1';
export const RESTOCKING_DISCLOSURE = "Restocking the remaining items may take 3\u20136 weeks. If an item won\u2019t be restocked, we\u2019ll inform you.";
export class BackorderError extends Error {
    constructor(message, code = 'stock_review_required', status = 409) { super(message); this.code = code; this.status = status; }
}
export const selectionObject = value => value instanceof Map ? Object.fromEntries(value) : value || {};
export const trackedShopLine = (product, item) => product?.productType === 'shop'
    && product.slug !== '3d-printer-repair-maintenance' && !item.requestId
    && !['digital', 'printDelivery'].includes(item.chosenDeliveryType);
export function selectedAvailability(product, selected = {}) {
    const variants = selectionObject(selected), counts = [];
    let restockStatus = product.restockStatus || 'unknown';
    if (product.infiniteStock) return { available: null, restockStatus, issue: 'Availability needs confirmation.' };
    const count = value => {
        if (value == null) return;
        if (!Number.isSafeInteger(value) || value < 0) throw new BackorderError('Stock needs owner review.', 'invalid_stock');
        counts.push(value);
    };
    count(product.stock);
    if (Object.keys(variants).length !== (product.variantTypes || []).length) return { available: null, restockStatus, issue: 'Choose every product option.' };
    for (const type of product.variantTypes || []) {
        const option = type.options?.find(o => o.name === variants[type.name]);
        if (!option) return { available: null, restockStatus, issue: 'Choose every product option.' };
        count(option.stock);
        if (option.restockStatus === 'not_restocked') restockStatus = 'not_restocked';
    }
    return { available: counts.length ? Math.min(...counts) : null, restockStatus,
        ...(!counts.length ? { issue: 'Availability needs confirmation.' } : {}) };
}
// Shared product/option pools are reduced in stable cart order. Excess units
// never consume stock; repeated lines cannot reuse the same available unit.
export function allocateLines(items, products, held = [], { fulfillment = false } = {}) {
    const pools = new Map(products.map(p => [String(p._id), structuredClone(p)]));
    function consumePool(product, selected, quantity) {
        if (product.stock != null) product.stock = Math.max(0, product.stock - quantity);
        for (const type of product.variantTypes || []) {
            const option = type.options.find(o => o.name === selected[type.name]);
            if (option?.stock != null) option.stock = Math.max(0, option.stock - quantity);
        }
    }
    for (const line of held) {
        const p = pools.get(String(line.productId));
        if (p) consumePool(p, line.selectedVariants, line.onHandQuantity);
    }
    return items.map(item => {
        const p = pools.get(String(item.productId));
        if (!p || !trackedShopLine(p, item)) return null;
        if (!fulfillment && (p.hidden || p.flaggedForModeration || p.quoteOnly)) throw new BackorderError('A product is unavailable.');
        if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) throw new BackorderError('Choose 1 to 100 whole units.', 'invalid_quantity', 400);
        const selectedVariants = selectionObject(item.selectedVariants);
        const current = selectedAvailability(p, selectedVariants);
        const onHandQuantity = current.available == null ? 0 : Math.min(item.quantity, current.available);
        const backorderQuantity = item.quantity - onHandQuantity;
        const blocked = !!current.issue || (backorderQuantity > 0 && current.restockStatus === 'not_restocked');
        const result = { version: 1, cartItemId: String(item.cartItemId || item._id), productId: String(item.productId),
            selectedVariants, quantity: item.quantity, availableQuantity: current.available, onHandQuantity,
            backorderQuantity, restockStatus: current.restockStatus, blocked,
            issue: current.issue || (blocked ? 'This selection will not be restocked. Reduce the quantity to available stock.' : null),
            source: 'mongo_product_and_active_allocations', disclosureVersion: RESTOCKING_VERSION,
            disclosure: backorderQuantity ? RESTOCKING_DISCLOSURE : null };
        if (!blocked) consumePool(p, selectedVariants, onHandQuantity);
        return result;
    });
}
