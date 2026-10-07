/**
 * Who sees "Add to Cart" / "Buy Now", and why.
 *
 * Background
 * ----------
 * Purchase controls were being hidden by two independent gates, and together
 * they made the buttons look like they appeared at random:
 *
 * 1. `listing === 'creator'` hides them. That is correct and deliberate -
 *    creator listings are arranged directly with the seller (see the
 *    "Contact the creator" panel in ProductPage.jsx). The problem is that
 *    models/Product.js declares `listing` with `default: "creator"`, so any
 *    product saved without an explicit listing silently became a creator
 *    listing. FIT's own shop stock fell into that default, which both removed
 *    its buy buttons and put FIT in the Creator tab.
 *
 * 2. The own-product suppression - `isItMyProduct()` in ProductCard.jsx and
 *    `product.creatorUserId !== user.id` in ProductPage.jsx - hides the
 *    controls on products you created. That makes sense for a marketplace
 *    creator looking at their own listing. It does not make sense for FIT's
 *    first-party shop stock, where the admin account is the creatorUserId on
 *    every product: the owner signs in and the entire shop loses its buy
 *    buttons, while signed-out visitors still see them. That is the
 *    "intermittent" behaviour.
 *
 * Gate 1 is a data problem and is fixed by tagging FIT stock `listing: 'fit'`
 * (see docs/listing-backfill-proposal.md - no data is changed by this file).
 * Gate 2 is a logic problem and is fixed here: first-party listings stay
 * purchasable by everyone, including the admin who owns them.
 *
 * Nothing in this module reads the network, the session or the database. It is
 * pure so it can be unit-tested without credentials, which matters because the
 * repo currently has no .env and cannot be booted locally.
 */

export const FIRST_PARTY_LISTING = 'fit'
export const CREATOR_LISTING = 'creator'

/**
 * First-party FIT stock rather than a marketplace creator's listing.
 *
 * A missing `listing` counts as first-party on purpose. Products created
 * before the field existed have no value, and lib/shopShipping.js already
 * treats null the same way; disagreeing here would mean an item that is
 * charged FIT delivery but shows no buy button.
 */
export function isFirstPartyListing(product) {
    const listing = product?.listing
    return listing == null || listing === FIRST_PARTY_LISTING
}

export function isCreatorListing(product) {
    return product?.listing === CREATOR_LISTING
}

/**
 * Decide whether purchase controls should render, with the reason why.
 *
 * The reason string is returned so callers can show the right alternative
 * panel ("Contact the creator", "Ask for a quote") instead of an empty space,
 * and so tests assert intent rather than a bare boolean.
 *
 * @param {object|null|undefined} product
 * @param {object} [viewer]
 * @param {string|null} [viewer.userId] Clerk user id, or null when signed out.
 * @param {boolean} [viewer.requireShopTypeForGuests] Preserve the existing
 *   ProductPage rule where signed-out visitors only see controls on
 *   `productType: 'shop'`. Off by default so ProductCard keeps applying its
 *   own stricter product-type check at the call site.
 * @returns {{ canPurchase: boolean, reason: string }}
 */
export function purchaseControlState(product, viewer = {}) {
    const { userId = null, requireShopTypeForGuests = false } = viewer

    if (!product) return { canPurchase: false, reason: 'no-product' }
    if (product.quoteOnly) return { canPurchase: false, reason: 'quote-only' }
    if (isCreatorListing(product)) return { canPurchase: false, reason: 'creator-listing' }

    if (requireShopTypeForGuests && !userId && product.productType !== 'shop') {
        return { canPurchase: false, reason: 'guest-non-shop' }
    }

    // The fix. Own-product suppression still applies to marketplace listings,
    // but never to first-party stock - otherwise the admin cannot buy, test or
    // demonstrate the shop they run.
    const viewerOwnsIt = Boolean(userId) && product.creatorUserId === userId
    if (viewerOwnsIt && !isFirstPartyListing(product)) {
        return { canPurchase: false, reason: 'own-creator-listing' }
    }

    return { canPurchase: true, reason: 'ok' }
}

/** Boolean convenience wrapper for JSX call sites. */
export function canShowPurchaseControls(product, viewer = {}) {
    return purchaseControlState(product, viewer).canPurchase
}
