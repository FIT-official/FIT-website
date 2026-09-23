import { connectToDatabase } from '@/lib/db'
import Product from '@/models/Product'
import { literalCategoryFilter } from '@/lib/productCatalogue'

export async function getShopProducts(params = {}) {
    await connectToDatabase()
    // Shop products created before storefront listings existed have no listing
    // field. Keep that catalogue visible without including explicit creator rows.
    const filter = {
        productType: 'shop', hidden: false, flaggedForModeration: { $ne: true },
        $or: [{ listing: 'fit' }, { listing: { $exists: false } }],
    }
    for (const [parameter, namedField, legacyField] of [
        ['productCategory', 'categoryId', 'category'],
        ['productSubCategory', 'subcategoryId', 'subcategory'],
    ]) {
        const value = typeof params[parameter] === 'string' ? params[parameter].trim() : ''
        if (value) {
            if (/^\d+$/.test(value)) filter[legacyField] = Number(value)
            else filter[namedField] = literalCategoryFilter(value)
        }
    }
    const products = await Product.find(filter)
        .select('_id name description images slug basePrice variantTypes stock discount discounts reviews.rating sales._id likes createdAt')
        .lean()
    return JSON.parse(JSON.stringify(products.map(({ sales, likes, ...product }) => ({
        ...product,
        salesCount: sales?.length || 0,
        likeCount: likes?.length || 0,
    }))))
}
