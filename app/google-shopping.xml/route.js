import { connectToDatabase } from '@/lib/db'
import Product from '@/models/Product'
import Event from '@/models/Event'
import { NON_PUBLIC_PRODUCT_SLUGS } from '@/lib/productPublicContent'
import { buildMerchantFeed } from '@/lib/seo/merchantFeed'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        await connectToDatabase()
        const now = new Date()
        const [products, events] = await Promise.all([
            Product.find({
                productType: 'shop', hidden: false, flaggedForModeration: { $ne: true },
                quoteOnly: { $ne: true },
                slug: { $nin: [...NON_PUBLIC_PRODUCT_SLUGS, 'custom-print-request'] },
                $or: [{ listing: 'fit' }, { listing: { $exists: false } }],
            }).select('_id name description images slug productType categoryId category listing hidden flaggedForModeration quoteOnly delivery.deliveryTypes.type delivery.deliveryTypes.price delivery.deliveryTypes.customPrice basePrice variantTypes stock infiniteStock discount discounts shippingCosts shippingWeightG shippingDims shippingDataFlag').lean(),
            Event.find({ isActive: true, isGlobal: true, startDate: { $lte: now }, endDate: { $gte: now } })
                .select('percentage minimumPrice startDate endDate').lean(),
        ])
        const rules = events.map(event => ({
            percentage: event.percentage, minimumAmount: event.minimumPrice,
            startDate: event.startDate, endDate: event.endDate,
        }))
        return new Response(buildMerchantFeed(products, rules), { headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=0, s-maxage=300',
            'X-Content-Type-Options': 'nosniff',
        } })
    } catch {
        // A failed stock or promotion read must not replace Google's catalogue
        // with an empty feed or publish an unverified price.
        return new Response('Product feed temporarily unavailable. Please retry.', {
            status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '300' },
        })
    }
}
