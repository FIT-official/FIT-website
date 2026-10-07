import { expect, it } from 'vitest';
import { checkoutItemLabels } from '@/lib/checkoutItemLabels';
it('shows the purchased PETG name and black option even when a product is retired or renamed', () => {
    const item = { productId: 'p1' };
    const snapshot = { productId: 'p1', productName: 'PETG', selectedVariants: { Colour: 'Black' } };
    expect(checkoutItemLabels(item, [snapshot], { name: 'New product' })).toEqual({ productName: 'PETG', variantName: 'Colour: Black' });
});
it('falls back to a known legacy variant without inventing missing historical details', () => {
    expect(checkoutItemLabels({ productId: 'p', variantId: 'v' }, [], { name: 'PLA', variants: [{ _id: 'v', name: 'White' }] }))
        .toEqual({ productName: 'PLA', variantName: 'White' });
    expect(checkoutItemLabels({ productId: 'p', variantId: 'v' })).toEqual({ productName: 'Product details unavailable', variantName: 'Variant details unavailable' });
});
it('does not pick an arbitrary variant from two matching product snapshots', () => {
    const snapshots = ['Black', 'White'].map(Colour => ({ productId: 'p', productName: 'PETG', selectedVariants: { Colour } }));
    expect(checkoutItemLabels({ productId: 'p' }, snapshots).variantName).toBe('No variant recorded');
});
