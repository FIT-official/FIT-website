// Money and fulfilment fields originate on the server, never from cart prices.
export function checkoutPlain(value) {
    return JSON.parse(JSON.stringify(value?.toObject ? value.toObject({ flattenMaps: true }) : value,
        (_key, entry) => entry instanceof Map ? Object.fromEntries(entry) : entry));
}

function cents(value) {
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid checkout price');
    const result = Math.round(value * 100);
    if (!Number.isSafeInteger(result)) throw new Error('Checkout amount is too large');
    return result;
}

export function buildCheckoutItem({ item, product, breakdown, customRequest, productPrintInput }) {
    const source = checkoutPlain(item);
    if (!source._id || !product?._id || !product.slug) throw new Error('Invalid checkout item identity');
    const quantity = Number(breakdown.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('Invalid item quantity');
    if ((customRequest || breakdown.chosenDeliveryType === 'digital') && quantity !== 1) {
        throw new Error('Digital products and custom print requests require quantity one');
    }
    if (String(breakdown.currency || '').toLowerCase() !== 'sgd') throw new Error('Only SGD checkout is supported');
    const unitAmount = cents(breakdown.price);
    const deliveryAmount = cents(breakdown.deliveryFee || 0);
    const totalAmount = unitAmount * quantity + deliveryAmount;
    if (!Number.isSafeInteger(totalAmount)) throw new Error('Checkout amount is too large');
    return checkoutPlain({
        cartItemId: String(source._id),
        sourceCart: source,
        productId: String(product._id),
        productName: customRequest ? `Custom 3D Print - ${customRequest.requestId}` : product.name,
        productSlug: product.slug,
        creatorUserId: product.creatorUserId,
        quantity,
        selectedVariants: source.selectedVariants || {},
        chosenDeliveryType: breakdown.chosenDeliveryType,
        orderNote: source.orderNote || '',
        requestId: customRequest?.requestId || null,
        basePrice: breakdown.basePrice || 0,
        priceBeforeDiscount: breakdown.priceBeforeDiscount ?? breakdown.price,
        variantInfo: breakdown.variantInfo || [],
        unitAmount, deliveryAmount, totalAmount, currency: 'sgd',
        paidAssets: Array.isArray(product.paidAssets) ? [...product.paidAssets] : [],
        customRequest: customRequest ? {
            modelFile: customRequest.modelFile || {},
            printConfiguration: customRequest.printConfiguration || {},
            quote: customRequest.quote || null,
            quoteMode: customRequest.quoteMode || null,
            basePrice: customRequest.basePrice || 0,
            printFee: customRequest.printFee || 0,
            delivery: customRequest.delivery || {},
        } : null,
        productPrintInput: productPrintInput || null,
    });
}

export function validateCheckoutPayment(session, checkout) {
    if (session.id !== checkout.sessionId) return 'Payment session does not match checkout';
    if (session.mode !== 'payment' || session.payment_status !== 'paid') return 'Payment is not paid';
    if (session.metadata?.userId !== checkout.userId) return 'Payment owner does not match checkout';
    if (checkout.snapshotVersion !== 1 || !Array.isArray(checkout.items) || !checkout.items.length) {
        return 'Checkout snapshot is unavailable; payment requires reconciliation';
    }
    const invalidItem = checkout.items.some(item =>
        !Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
        !Number.isSafeInteger(item.unitAmount) || item.unitAmount < 0 ||
        !Number.isSafeInteger(item.deliveryAmount) || item.deliveryAmount < 0 ||
        item.totalAmount !== item.unitAmount * item.quantity + item.deliveryAmount ||
        item.currency !== checkout.currency);
    const expected = checkout.items.reduce((sum, item) => sum + item.totalAmount, 0);
    if (invalidItem || !Number.isSafeInteger(expected) || expected !== checkout.totalAmount ||
        session.amount_total !== expected || session.currency !== checkout.currency) {
        return 'Payment amount or currency does not match checkout';
    }
    return null;
}

function cartIdentity(item) {
    return JSON.stringify({
        productId: item.productId,
        variantId: item.variantId || null,
        selectedVariants: Object.entries(item.selectedVariants || {}).sort(([a], [b]) => a.localeCompare(b)),
        chosenDeliveryType: item.chosenDeliveryType,
        orderNote: item.orderNote || '',
        requestId: item.requestId || null,
    });
}

// Keep new lines and changed configurations; subtract only the paid quantity
// from the original line, preserving any units added while payment was open.
export function removePurchasedCartItems(cart, snapshots) {
    const remaining = checkoutPlain(cart || []);
    for (const snapshot of snapshots) {
        const index = remaining.findIndex(item => String(item._id) === snapshot.cartItemId &&
            cartIdentity(item) === cartIdentity(snapshot.sourceCart));
        if (index < 0) continue;
        const line = remaining[index];
        if (line.quantity < snapshot.quantity) continue;
        if (line.quantity === snapshot.quantity) remaining.splice(index, 1);
        else line.quantity -= snapshot.quantity;
    }
    return remaining;
}

export function checkoutOrderItem(item) {
    return {
        productId: item.productId, productName: item.productName, productSlug: item.productSlug,
        quantity: item.quantity, selectedVariants: item.selectedVariants, variantInfo: item.variantInfo,
        basePrice: item.basePrice,
        variantFees: item.variantInfo.reduce((sum, v) => sum + (v.additionalFee || 0), 0),
        priceBeforeDiscount: item.priceBeforeDiscount,
        discount: Math.max(0, item.priceBeforeDiscount - item.unitAmount / 100),
        finalPrice: item.unitAmount / 100,
        deliveryFee: item.deliveryAmount / 100,
        totalPrice: item.totalAmount / 100,
        currency: item.currency.toUpperCase(), chosenDeliveryType: item.chosenDeliveryType,
        orderNote: item.orderNote, requestId: item.requestId,
    };
}
