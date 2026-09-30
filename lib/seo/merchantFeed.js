import { productJsonLd } from './product'
import { SITE_URL } from './site'

export function merchantProduct(product, discountRules = []) {
    // Only FIT's retail catalogue belongs to this merchant account. Legacy
    // shop records have no listing field; explicit creator listings stay out.
    if (!product || product.hidden !== false || product.productType !== 'shop' ||
        (product.listing != null && product.listing !== 'fit') || product.quoteOnly ||
        product.slug === 'custom-print-request') return null
    const delivery = product.delivery?.deliveryTypes || []
    if (!delivery.length || delivery.some(option => option.type === 'digital')) return null
    // Only the store's configured standard shipping service is advertised.
    // This also excludes collection-only repair appointments and unknown services.
    const standardShipping = delivery.find(option => option.type === 'standard-shipping')
    const shippingPrice = standardShipping?.customPrice ?? standardShipping?.price
    if (!Number.isFinite(shippingPrice) || shippingPrice < 0) return null

    // Reuse the landing page's first selected options, discounts and stock.
    // Do not advertise other variants until their URLs preselect those variants.
    const schema = productJsonLd(product, discountRules)
    const offer = schema?.offers
    if (!product._id || !product.slug || !schema?.name?.trim() || !schema.description ||
        !schema.image?.length || !offer || offer.priceCurrency !== 'SGD' ||
        !(Number(offer.price) > 0) || !offer.availability) return null
    const options = (product.variantTypes || []).map(type => type.options[0].name)
    const title = [schema.name, options.join(' / ')].filter(Boolean).join(' - ').slice(0, 150)
    return {
        id: String(product._id), title, description: schema.description,
        link: schema.url, image_link: schema.image[0],
        additional_image_link: schema.image.slice(1, 11),
        price: `${offer.price} ${offer.priceCurrency}`,
        availability: offer.availability.endsWith('/InStock') ? 'in_stock' : 'out_of_stock',
        shipping: {
            country: 'SG', service: 'Standard delivery', price: `${shippingPrice.toFixed(2)} SGD`,
            min_handling_time: 2, max_handling_time: 2, min_transit_time: 3, max_transit_time: 3,
        },
    }
}

function xml(value) {
    return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function fields(object) {
    return Object.entries(object).flatMap(([key, value]) =>
        (Array.isArray(value) ? value : [value]).map(entry =>
            `<g:${key}>${entry && typeof entry === 'object' ? fields(entry) : xml(entry)}</g:${key}>`)
    ).join('')
}

export function buildMerchantFeed(products, discountRules = []) {
    const items = products.map(product => merchantProduct(product, discountRules)).filter(Boolean)
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>\n' +
        `<title>Fix It Today</title><link>${SITE_URL}/shop</link>` +
        '<description>Fix It Today shop products</description>\n' +
        items.map(item => '<item>' + fields(item) + '</item>').join('\n') + '\n</channel></rss>\n'
}
