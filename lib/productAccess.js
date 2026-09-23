// Only editable catalogue fields can be supplied by the browser. Ownership,
// sales, review verification, moderation, and usage are server-maintained.
const EDITABLE = [
  'name', 'description', 'images', 'viewableModel', 'paidAssets', 'basePrice',
  'priceCredits', 'stock', 'infiniteStock', 'productType', 'printConfig',
  'category', 'subcategory', 'categoryId', 'subcategoryId', 'variantTypes',
  'delivery', 'dimensions', 'discount', 'discounts', 'hidden',
]

export function editableProduct(body = {}) {
  return Object.fromEntries(EDITABLE.filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]]))
}

export function canManageProduct(product, userId, isAdmin = false) {
  return Boolean(isAdmin || (userId && product?.creatorUserId === userId))
}

export function visibleProduct(product, userId, isAdmin = false) {
  return Boolean(product && (canManageProduct(product, userId, isAdmin) || (!product.hidden && !product.flaggedForModeration)))
}

export function productForViewer(product, userId, isAdmin = false) {
  if (!visibleProduct(product, userId, isAdmin)) return null
  if (canManageProduct(product, userId, isAdmin)) return product
  const { sales, paidAssets, likes, ...publicProduct } = product
  // Keep the current viewer's like state without exposing other user ids.
  return { ...publicProduct, paidAssets: [], hasPaidAssets: Boolean(paidAssets?.length), likes: userId && likes?.includes(userId) ? [userId] : [], likeCount: likes?.length || 0 }
}
