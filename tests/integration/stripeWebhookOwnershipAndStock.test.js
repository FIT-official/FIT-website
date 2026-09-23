// Ownership, stock and retry cases now share the transaction-aware integration
// fixture in stripeWebhookIdempotency.test.js. Cart cleanup also needs to handle
// maps and quantity reductions without erasing newer customer choices.
import { describe, expect, it } from 'vitest';
import { removePurchasedCartItems } from '@/lib/checkoutSnapshot';

describe('Paid checkout cart cleanup', () => {
    const source = { _id: 'line', productId: 'p', quantity: 3, chosenDeliveryType: 'shipping', selectedVariants: { Size: 'M' }, orderNote: '' };
    const snapshot = { cartItemId: 'line', sourceCart: source, quantity: 3 };
    it('preserves a reduced quantity chosen after checkout opened', () => {
        expect(removePurchasedCartItems([{ ...source, quantity: 1 }], [snapshot])[0].quantity).toBe(1);
    });
    it('matches Mongoose Maps to the saved plain variant selection', () => {
        expect(removePurchasedCartItems([{ ...source, selectedVariants: new Map([['Size', 'M']]) }], [snapshot])).toEqual([]);
    });
    it('never removes a replacement cart line with a new identity', () => {
        const replacement = { ...source, _id: 'new-line' };
        expect(removePurchasedCartItems([replacement], [snapshot])).toEqual([replacement]);
    });
    it('preserves a later change to a legacy variant identifier', () => {
        const changed = { ...source, variantId: 'different-variant' };
        expect(removePurchasedCartItems([changed], [snapshot])).toEqual([changed]);
    });
});
