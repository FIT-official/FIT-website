import { connectToDatabase } from '@/lib/db'
import Product from '@/models/Product'
import BlogPost from '@/models/BlogPost'
import { statusQuery } from '@/lib/blog/status'
import { programmePostCopy } from '@/lib/blog/programmeCopy'
import { selectShopPicks } from './content'

// Same catalogue and published-blog data as the legacy home. Narrow, read-only
// queries avoid client waterfalls and never create indexes or seed records.
export async function getHomeShopPicks() {
    try {
        await connectToDatabase()
        const products = await Product.find({ productType: 'shop', listing: 'fit', hidden: false, flaggedForModeration: { $ne: true } })
            .select('name slug images productType hidden flaggedForModeration')
            .limit(200).maxTimeMS(1500).lean()
        return selectShopPicks(products)
    } catch { return [] }
}

export async function getHomeGuides() {
    try {
        await connectToDatabase()
        const posts = await BlogPost.find(statusQuery('published'))
            .select('title slug excerpt heroImage publishDate createdAt readingTimeMinutes')
            .sort({ publishDate: -1, createdAt: -1 }).limit(3).maxTimeMS(1500).lean()
        return posts.map(programmePostCopy)
    } catch { return [] }
}
