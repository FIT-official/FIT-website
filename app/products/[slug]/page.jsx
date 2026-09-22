import { cache } from 'react'
import { notFound, permanentRedirect } from 'next/navigation'
import { connectToDatabase } from '@/lib/db'
import Product from '@/models/Product'
import Event from '@/models/Event'
import { jsonLdString } from '@/lib/jsonLd'
import { productMetadata, productJsonLd, publicProductSeed } from '@/lib/seo/product'
import ProductPage from './ProductPage'

// Keep inventory and promotions current, with one shared read per render.
export const dynamic = 'force-dynamic'

const getProduct = cache(async (slug) => {
    await connectToDatabase()
    return Product.findOne({ slug }).select([
        '_id', 'slug', 'name', 'description', 'images', 'basePrice', 'productType',
        'stock', 'infiniteStock', 'viewableModel', 'variantTypes', 'discount', 'discounts',
        'delivery.deliveryTypes.type', 'hidden', 'flaggedForModeration',
        'reviews._id', 'reviews.username', 'reviews.userImageUrl', 'reviews.rating',
        'reviews.comment', 'reviews.mediaUrls', 'reviews.verifiedPurchase', 'reviews.createdAt',
    ].join(' ')).lean()
})

async function getGlobalDiscountRules() {
    const now = new Date()
    const events = await Event.find({
        isActive: true,
        isGlobal: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
    }).select('name percentage minimumPrice startDate endDate').lean()
    return events.map(event => ({
        percentage: event.percentage,
        minimumAmount: event.minimumPrice,
        startDate: event.startDate?.toISOString(),
        endDate: event.endDate?.toISOString(),
        eventName: event.name,
    }))
}

export async function generateMetadata({ params }) {
    const { slug } = await params
    if (slug === 'custom-print-request') return { title: 'Request a 3D print | Fix It Today' }
    return productMetadata(await getProduct(slug))
}

export default async function ProductPageLayout({ params }) {
    const { slug } = await params
    if (slug === 'custom-print-request') permanentRedirect('/prints/request')
    const product = await getProduct(slug)
    if (!product) notFound()

    let globalDiscountRules = []
    let includeOffers = true
    try {
        globalDiscountRules = await getGlobalDiscountRules()
    } catch {
        // Keep the page available when promotions cannot be read, but do not
        // advertise a price that may be missing an active global discount.
        includeOffers = false
    }
    const jsonLd = productJsonLd(product, globalDiscountRules, includeOffers)

    return (
        <>
            {jsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
                />
            )}
            <ProductPage
                key={slug}
                initialProduct={publicProductSeed(product)}
                initialGlobalDiscountRules={globalDiscountRules}
            />
        </>
    )
}
