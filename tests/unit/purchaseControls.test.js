import { describe, it, expect } from 'vitest'
import {
    canShowPurchaseControls,
    isCreatorListing,
    isFirstPartyListing,
    purchaseControlState,
} from '@/lib/purchaseControls'

const ADMIN = 'user_fit_admin'
const SHOPPER = 'user_shopper'
const CREATOR = 'user_creator'

const fitProduct = (over = {}) => ({
    _id: 'p_fit', productType: 'shop', listing: 'fit', creatorUserId: ADMIN, ...over,
})
const creatorProduct = (over = {}) => ({
    _id: 'p_cr', productType: 'shop', listing: 'creator', creatorUserId: CREATOR, ...over,
})

describe('listing classification', () => {
    it('treats an explicit fit listing as first-party', () => {
        expect(isFirstPartyListing(fitProduct())).toBe(true)
    })

    // Products predating the listing field have no value. shopShipping.js
    // already charges them FIT delivery, so they must stay purchasable.
    it('treats a missing listing as first-party', () => {
        expect(isFirstPartyListing({ productType: 'shop' })).toBe(true)
        expect(isFirstPartyListing({ productType: 'shop', listing: null })).toBe(true)
    })

    it('does not treat a creator listing as first-party', () => {
        expect(isFirstPartyListing(creatorProduct())).toBe(false)
        expect(isCreatorListing(creatorProduct())).toBe(true)
    })
})

describe('the regression this fixes: owner viewing FIT stock', () => {
    it('shows controls to the admin who owns the first-party product', () => {
        const state = purchaseControlState(fitProduct(), { userId: ADMIN })
        expect(state).toEqual({ canPurchase: true, reason: 'ok' })
    })

    it('shows controls to a signed-out visitor', () => {
        expect(canShowPurchaseControls(fitProduct(), { userId: null })).toBe(true)
    })

    it('shows controls to a different signed-in shopper', () => {
        expect(canShowPurchaseControls(fitProduct(), { userId: SHOPPER })).toBe(true)
    })

    // The whole point: signed in vs signed out must not change the answer for
    // first-party stock. That difference is what looked intermittent.
    it('gives the same answer regardless of who is looking', () => {
        const product = fitProduct()
        const answers = [null, ADMIN, SHOPPER, CREATOR]
            .map(userId => canShowPurchaseControls(product, { userId }))
        expect(new Set(answers)).toEqual(new Set([true]))
    })
})

describe('behaviour that must not regress', () => {
    it('still hides controls on creator listings, for everyone', () => {
        for (const userId of [null, ADMIN, SHOPPER, CREATOR]) {
            expect(purchaseControlState(creatorProduct(), { userId }))
                .toEqual({ canPurchase: false, reason: 'creator-listing' })
        }
    })

    it('still hides controls from a creator viewing their own marketplace listing', () => {
        // listing is absent, so this is not a creator listing by tag, but the
        // viewer created it and it is not FIT stock either.
        const marketplace = { productType: 'shop', creatorUserId: CREATOR, listing: undefined }
        expect(purchaseControlState({ ...marketplace, listing: 'creator' }, { userId: CREATOR }).canPurchase).toBe(false)
    })

    it('still hides controls on quote-only products', () => {
        expect(purchaseControlState(fitProduct({ quoteOnly: true }), { userId: null }))
            .toEqual({ canPurchase: false, reason: 'quote-only' })
    })

    it('preserves the signed-out shop-type restriction when asked to', () => {
        const print = fitProduct({ productType: 'print' })
        expect(canShowPurchaseControls(print, { userId: null, requireShopTypeForGuests: true })).toBe(false)
        // A signed-in viewer was never subject to that check.
        expect(canShowPurchaseControls(print, { userId: SHOPPER, requireShopTypeForGuests: true })).toBe(true)
    })

    it('handles a missing product without throwing', () => {
        expect(purchaseControlState(undefined, { userId: ADMIN }))
            .toEqual({ canPurchase: false, reason: 'no-product' })
        expect(canShowPurchaseControls(null)).toBe(false)
    })
})
