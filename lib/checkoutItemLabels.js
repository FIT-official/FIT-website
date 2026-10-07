// Historical purchase labels come from the purchase snapshot, not today's
// catalogue. Never guess a variant when several snapshots match one legacy row.
export function checkoutItemLabels(item, snapshots = [], product) {
    const candidates = (Array.isArray(snapshots) ? snapshots : []).filter(snapshot => String(snapshot.productId) === String(item.productId) &&
        (!item.variantId || snapshot.sourceCart?.variantId === item.variantId));
    const snapshot = candidates.length === 1 ? candidates[0] : null;
    const selections = snapshot?.selectedVariants || item.selectedVariants;
    const variant = product?.variants?.find(option => String(option._id) === String(item.variantId));
    const selectedNames = selections instanceof Map ? [...selections] : Object.entries(selections || {});
    return {
        productName: snapshot?.productName || item.productName || product?.name || 'Product details unavailable',
        variantName: selectedNames.length
            ? selectedNames.map(([name, value]) => `${name}: ${value}`).join(', ')
            : variant?.name || (item.variantId ? 'Variant details unavailable' : 'No variant recorded'),
    };
}
