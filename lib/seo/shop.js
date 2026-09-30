import { connectToDatabase } from '@/lib/db'
import Product from '@/models/Product'
import { literalCategoryFilter } from '@/lib/productCatalogue'
import { NON_PUBLIC_PRODUCT_SLUGS, publicProductDescription } from '@/lib/productPublicContent'

async function getCatalogueProducts(productType, params = {}) {
    await connectToDatabase()
    // Shop products created before storefront listings existed have no listing
    // field. Keep that catalogue visible without including explicit creator rows.
    const filter = {
        productType, hidden: false, flaggedForModeration: { $ne: true },
        slug: { $nin: [...NON_PUBLIC_PRODUCT_SLUGS, 'custom-print-request'] },
        ...(productType === 'shop'
            ? { $or: [{ listing: 'fit' }, { listing: { $exists: false } }] }
            : { listing: 'fit' }),
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
        .select('_id name description images slug productType listing delivery basePrice variantTypes stock infiniteStock quoteOnly discount discounts reviews.rating sales._id likes createdAt')
        .lean()
    return JSON.parse(JSON.stringify(products.map(({ sales, likes, ...product }) => ({
        ...product,
        description: publicProductDescription(product.description),
        salesCount: sales?.length || 0,
        likeCount: likes?.length || 0,
    }))))
}

export function getShopProducts(params = {}) {
    return getCatalogueProducts('shop', params)
}

export function getPrintProducts(params = {}) {
    return getCatalogueProducts('print', params)
}
