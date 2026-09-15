import { connectToDatabase } from '@/lib/db'
import Product from '@/models/Product'
import BlogPost from '@/models/BlogPost'
import User from '@/models/User'
import { statusQuery } from '@/lib/blog/status'
import { buildPublicSitemap, PUBLIC_PRODUCT_SITEMAP_FILTER, PUBLIC_CREATOR_SITEMAP_FILTER } from '@/lib/seo/sitemap'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function sitemap() {
    await connectToDatabase()
    // Read only URL/visibility/timestamp fields. No content bodies, user data,
    // in-memory date sort, or build-time snapshot of the catalogue is needed.
    const [products, posts, creators] = await Promise.all([
        Product.find(PUBLIC_PRODUCT_SITEMAP_FILTER)
            .select('slug hidden flaggedForModeration updatedAt createdAt')
            .lean(),
        BlogPost.find(statusQuery('published'))
            .select('slug status published updatedAt publishDate createdAt')
            .lean(),
        User.find(PUBLIC_CREATOR_SITEMAP_FILTER)
            .select('metadata.displayName shop.published')
            .lean(),
    ])
    // Let a database outage return a failure for crawlers to retry, rather than
    // reporting a successful but empty catalogue sitemap.
    return buildPublicSitemap({ products, posts, creators })
}
