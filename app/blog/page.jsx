import { jsonLdString } from '@/lib/jsonLd'
import { connectToDatabase } from '@/lib/db'
import BlogPost from '@/models/BlogPost'
import { statusQuery } from '@/lib/blog/status'
import { buildPageMetadata } from '@/lib/seo/metadata'
import { absoluteUrl } from '@/lib/seo/site'
import { validIsoDate } from '@/lib/seo/publicContent'
import Blog from './Blog'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { workshopPost } from '@/lib/blog/designThinkingWorkshop'

export const dynamic = 'force-dynamic'

const pageNumber = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 1
const description = 'Read guides to 3D printing, printer care and electronics, with project ideas and school workshop stories from Fix It Today in Singapore.'
const pagePath = page => page > 1 ? `/blog?page=${page}` : '/blog'

export async function generateMetadata({ searchParams } = {}) {
    const page = pageNumber((await searchParams)?.page)
    return buildPageMetadata({
        title: `3D Printing, Electronics & STEM Guides${page > 1 ? ` | Page ${page}` : ''} | Fix It Today`,
        description, path: pagePath(page),
    })
}

export default async function BlogLayout({ searchParams } = {}) {
    const page = pageNumber((await searchParams)?.page)
    const pageSize = 200
    await connectToDatabase()
    const filter = statusQuery('published')
    const total = await BlogPost.countDocuments(filter)
    if (page > 1 && page > Math.ceil(total / pageSize)) notFound()
    const posts = await BlogPost.find(filter)
        .select('title slug excerpt heroImage tags categories featured publishDate createdAt readingTimeMinutes')
        .sort({ publishDate: -1, createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean()
    if (page > 1 && !posts.length) notFound()
    const listedPosts = page === 1 ? [workshopPost, ...posts.filter(post => post.slug !== workshopPost.slug)] : posts
    const initialPosts = JSON.parse(JSON.stringify(listedPosts)).map(post => ({
        ...post,
        publishDateFormatted: validIsoDate(post.publishDate)
            ? new Date(post.publishDate).toLocaleDateString('en-GB', { timeZone: 'UTC' }) : null,
    }))
    const schema = {
        '@context': 'https://schema.org', '@type': 'Blog',
        name: 'Fix It Today Blog', description, url: absoluteUrl(pagePath(page)),
        publisher: { '@type': 'Organization', name: 'Fix It Today', url: absoluteUrl('/') },
        blogPost: initialPosts.map(post => ({ '@type': 'BlogPosting', headline: post.title, url: absoluteUrl(`/blog/${encodeURIComponent(post.slug)}`) })),
    }
    return <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(schema) }} />
        <Blog key={page} initialPosts={initialPosts} pagination={(page > 1 || page * pageSize < total) && <nav aria-label="Blog pages" className="flex items-center justify-center gap-6 mt-8 text-sm">
            {page > 1 && <Link href={pagePath(page - 1)} className="underline underline-offset-4">Previous</Link>}
            <span>Page {page}</span>
            {page * pageSize < total && <Link href={pagePath(page + 1)} className="underline underline-offset-4">Next</Link>}
        </nav>} />
    </>
}
