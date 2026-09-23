import { connectToDatabase } from '@/lib/db'
import Product from '@/models/Product'
import { literalCategoryFilter } from '@/lib/productCatalogue'

export async function getShopProducts(params = {}) {
    await connectToDatabase()
    const filter = { productType: 'shop', listing: 'fit', hidden: false, flaggedForModeration: { $ne: true } }
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
