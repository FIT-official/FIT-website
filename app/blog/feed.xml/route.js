import { connectToDatabase } from '@/lib/db'
import BlogPost from '@/models/BlogPost'
import { buildRssXml } from '@/lib/blog/rss'
import { BLOG_SORT_INDEX, ensureBlogSortIndex } from '@/lib/blog/sortIndex'

export const runtime = 'nodejs'

// RSS 2.0 feed — latest 20 published posts, cached 1h.
export async function GET() {
    await connectToDatabase()
    await ensureBlogSortIndex()
    const posts = await BlogPost.find({ published: true })
        .select('title slug excerpt publishDate')
        .sort({ publishDate: -1 })
        .hint(BLOG_SORT_INDEX)
        .limit(20)
        .lean()

    const xml = buildRssXml({
        title: 'Fix It Today® Blog',
        siteUrl: process.env.NEXT_PUBLIC_BASE_URL || 'https://fixitoday.com',
        description: 'Learn more about 3D printing, digital products, and updates from the FIT team.',
        posts,
    })

    return new Response(xml, {
        headers: {
            'Content-Type': 'application/rss+xml; charset=utf-8',
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=3600',
        },
    })
}
