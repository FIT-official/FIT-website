import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import User from '@/models/User';

function legacyUser() {
    return User.hydrate({ _id: new mongoose.Types.ObjectId(), userId: 'synthetic-buyer',
        contact: { phone: {}, address: { street: 'Synthetic street', city: 'Singapore', postalCode: '000000', country: 'SG' } },
        cart: [], orderHistory: [],
    });
}
const paidItem = () => ({ cartItem: { productId: 'synthetic-product', quantity: 1,
    chosenDeliveryType: 'pick-up', price: 13.90, selectedVariants: { Colour: 'Black' } },
    status: 'pending', stripeSessionId: 'cs_synthetic',
});
describe('real User schema: paid checkout with untouched legacy contact', () => {
    it('reproduces the phone validation error from historical production logs', async () => {
        const user = legacyUser(); user.orderHistory.push(paidItem());
        const error = await user.validate().catch(error => error);
        expect(error.errors['contact.phone.number']).toBeDefined();
        expect(error.errors['contact.phone.countryCode']).toBeDefined();
    });
    it('validates checkout changes while preserving the unrelated incomplete contact', async () => {
        const user = legacyUser(), before = user.contact.toObject();
        user.orderHistory.push(paidItem()); user.cart = []; user.checkoutIntent = 'rotated-synthetic-intent';
        await expect(user.validate({ validateModifiedOnly: true })).resolves.toBeUndefined();
        expect(user.contact.toObject()).toEqual(before);
        expect(user.isModified('contact')).toBe(false);
    });
    it('still rejects invalid newly purchased order data', async () => {
        const user = legacyUser(), item = paidItem(); item.cartItem.price = -1; user.orderHistory.push(item);
        await expect(user.validate({ validateModifiedOnly: true })).rejects.toThrow(/price/);
    });
    it('still validates a contact when that contact was actually changed', async () => {
        const user = legacyUser(); user.contact.phone.number = '';
        await expect(user.validate({ validateModifiedOnly: true })).rejects.toThrow(/phone.number/);
    });
});
