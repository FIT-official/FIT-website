import { isPublicCatalogueProduct, publicProductDescription, cleanProductCopy } from '@/lib/productPublicContent'
import { isFitShopProduct, paidShopDeliveryFee } from './shopShipping'

// Only editable catalogue fields can be supplied by the browser. Ownership,
// sales, review verification, moderation, and usage are server-maintained.
const EDITABLE = [
  'name', 'description', 'images', 'viewableModel', 'paidAssets', 'basePrice',
  'priceCredits', 'stock', 'infiniteStock', 'quoteOnly', 'productType', 'printConfig',
  'category', 'subcategory', 'categoryId', 'subcategoryId', 'variantTypes',
  'delivery', 'dimensions', 'discount', 'discounts', 'hidden',
]

export function editableProduct(body = {}) {
  return cleanProductCopy(Object.fromEntries(EDITABLE.filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]])))
}

export function canManageProduct(product, userId, isAdmin = false) {
  return Boolean(isAdmin || (userId && product?.creatorUserId === userId))
}

export function visibleProduct(product, userId, isAdmin = false) {
  return Boolean(product && (canManageProduct(product, userId, isAdmin) || isPublicCatalogueProduct(product)))
}

export function productForViewer(product, userId, isAdmin = false) {
  if (!visibleProduct(product, userId, isAdmin)) return null
  if (canManageProduct(product, userId, isAdmin)) return product
  const { sales, paidAssets, likes, shippingCosts, ...publicProduct } = product
  // A legacy zero shipping price is not an unconditional free-delivery offer.
  // Preserve the existing paid fallback when publishing product delivery fees.
  if (isFitShopProduct(product) && product.delivery?.deliveryTypes) {
    publicProduct.delivery = { ...product.delivery, deliveryTypes: product.delivery.deliveryTypes.map(option => {
      const current = option.customPrice ?? option.price
      const fee = paidShopDeliveryFee(product, option.type, current)
      return fee === current ? option : { ...option, price: fee, customPrice: fee }
    }) }
  }
  // Keep the current viewer's like state without exposing other user ids.
  return { ...cleanProductCopy(publicProduct), description: publicProductDescription(product.description), paidAssets: [], hasPaidAssets: Boolean(paidAssets?.length), likes: userId && likes?.includes(userId) ? [userId] : [], likeCount: likes?.length || 0 }
}
