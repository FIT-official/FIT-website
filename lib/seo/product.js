import { absoluteUrl } from './site'
import { productImageSrc } from '@/lib/productImage'
import { getDiscountedPrice } from '@/utils/discount'
import { isPublicCatalogueProduct, publicProductDescription } from '@/lib/productPublicContent'

export function productDescription(value, maxLength = 160) {
    const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }
    const text = publicProductDescription(value)
        .replace(/<[^>]*>/g, ' ')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+)/gm, '')
        .replace(/(\d)\s*\*\s*(?=\d)/g, '$1 × ')
        .replace(/[*_`~]/g, '')
        .replace(/&(amp|quot|apos|lt|gt|nbsp);/gi, (_, entity) => entities[entity.toLowerCase()])
        .replace(/&#(x[\da-f]+|\d+);/gi, (entity, code) => {
            const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)
            return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
                ? String.fromCodePoint(point) : entity
        })
        .replace(/\s+/g, ' ')
        .trim()
    if (text.length <= maxLength) return text
    return `${text.slice(0, maxLength - 1).replace(/\s+\S*$/, '').trimEnd()}…`
}

export function productImageUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null
    return absoluteUrl(productImageSrc(value))
}

export function getDefaultVariantSelections(product) {
    return Object.fromEntries((product?.variantTypes || [])
        .filter(type => type.options?.length)
        .map(type => [type.name, type.options[0].name]))
}

export function isIndexableProduct(product) {
    return isPublicCatalogueProduct(product)
}

export function productMetadata(product) {
    if (!isIndexableProduct(product)) {
        return { title: 'Product | Fix It Today®', robots: { index: false, follow: false } }
    }
    // Names are plain catalogue labels, not Markdown. Preserve dimensions and
    // part identifiers containing characters such as asterisks or underscores.
    const name = String(product.name || 'Product').trim()
    const title = `${name} | Fix It Today®`
    const description = productDescription(product.description) || (product.productType === 'print'
        ? `View ${name}, its images and available options at Fix It Today.`
        : `View ${name}, product options and current pricing at Fix It Today.`)
    const url = absoluteUrl(`/products/${encodeURIComponent(product.slug)}`)
    const images = (product.images || []).map(productImageUrl).filter(Boolean)
    const shareImages = images.length ? images : [absoluteUrl('/fitogimage.png')]
    return {
        title,
        description,
        alternates: { canonical: url },
        openGraph: {
            title, description, url,
            siteName: 'Fix It Today®',
            images: shareImages.map(image => ({ url: image, alt: images.length ? name : 'Fix It Today' })),
            locale: 'en_SG',
            type: 'website',
        },
        twitter: { card: 'summary_large_image', title, description, images: shareImages },
    }
}

// The page selects the first option in each variant type. Describe that
// selection, including its stock, fees and single-item discounts.
export function productJsonLd(product, globalDiscountRules = [], includeOffers = true) {
    if (!isIndexableProduct(product)) return null
    const url = absoluteUrl(`/products/${encodeURIComponent(product.slug)}`)
    const images = (product.images || []).map(productImageUrl).filter(Boolean)
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        description: productDescription(product.description, 5000),
        ...(images.length ? { image: images } : {}),
        sku: String(product._id),
        url,
    }
    const ratings = (product.reviews || []).map(review => review.rating)
        .filter(rating => Number.isFinite(rating) && rating >= 1 && rating <= 5)
    if (ratings.length) {
        jsonLd.aggregateRating = {
            '@type': 'AggregateRating',
            ratingValue: Number((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)),
            reviewCount: ratings.length,
        }
    }
    // Print configurations are quoted separately: base price is not the
    // purchasable finished-print price.
    const amount = product.basePrice?.presentmentAmount
    const currency = product.basePrice?.presentmentCurrency
    if (!includeOffers || product.quoteOnly || product.productType !== 'shop' || !Number.isFinite(amount) || amount < 0 || !currency) {
        return jsonLd
    }
    const selectedOptions = (product.variantTypes || []).map(type => type.options?.[0])
    if (selectedOptions.some(option => !option)) return jsonLd
    const price = amount + selectedOptions.reduce((sum, option) => sum + (option.additionalFee || 0), 0)
    if (!Number.isFinite(price) || price < 0) return jsonLd
    const discounted = getDiscountedPrice({
        ...product,
        price: { presentmentAmount: price, presentmentCurrency: currency },
    }, 1, globalDiscountRules)
    const stockValues = [product.stock, ...selectedOptions.map(option => option.stock)].filter(Number.isFinite)
    const availability = product.infiniteStock === true ? 'InStock'
        : stockValues.some(stock => stock <= 0) ? 'OutOfStock'
            : stockValues.length ? 'InStock' : null
    jsonLd.offers = {
        '@type': 'Offer',
        priceCurrency: currency,
        price: (discounted ?? price).toFixed(2),
        ...(availability ? { availability: `https://schema.org/${availability}` } : {}),
        url,
    }
    return jsonLd
}

// Send only display fields to the client, excluding account identifiers,
// paid download keys, sales and lists of users who liked a product.
export function publicProductSeed(product) {
    if (!isIndexableProduct(product)) return null
    const pick = (source, fields) => Object.fromEntries(fields
        .filter(field => source?.[field] !== undefined)
        .map(field => [field, source[field]]))
    const discountFields = ['percentage', 'minimumAmount', 'startDate', 'endDate', 'tiers']
    const seed = pick(product, [
        '_id', 'slug', 'name', 'description', 'images', 'basePrice', 'productType',
        'stock', 'infiniteStock', 'quoteOnly', 'viewableModel', 'categoryId', 'category',
    ])
    seed.description = publicProductDescription(product.description)
    seed.variantTypes = (product.variantTypes || []).map(type => ({
        ...pick(type, ['_id', 'name']),
        options: (type.options || []).map(option => pick(option, ['_id', 'name', 'additionalFee', 'stock', 'image', 'hex'])),
    }))
    seed.delivery = { deliveryTypes: (product.delivery?.deliveryTypes || []).map(type => pick(type, ['type'])) }
    seed.discount = pick(product.discount, discountFields)
    seed.discounts = (product.discounts || []).map(rule => pick(rule, discountFields))
    seed.reviews = (product.reviews || []).map(review => pick(review, [
        '_id', 'username', 'userImageUrl', 'rating', 'comment', 'mediaUrls', 'verifiedPurchase', 'createdAt',
    ]))
    return JSON.parse(JSON.stringify(seed))
}
