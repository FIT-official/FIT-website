import { describe, expect, it } from 'vitest';
import { orderProductSummary } from '@/lib/orderProductSummary';

describe('retired product order history', () => {
    it('keeps identifying details without private assets, sales or a dead product link', () => {
        const summary = orderProductSummary({ _id: 'p1', name: 'Display', images: ['image.jpg'], creatorUserId: 'seller',
            slug: 'old-display', hidden: true, paidAssets: ['private.stl'], sales: [{ userId: 'other' }] });
        expect(summary).toEqual({ _id: 'p1', name: 'Display', images: ['image.jpg'], creatorUserId: 'seller' });
    });
    it('retains a product link for a visible listing', () => {
        expect(orderProductSummary({ _id: 'p1', slug: 'display' }).slug).toBe('display');
    });
});
