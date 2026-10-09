import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { jsonLdString } from '@/lib/jsonLd'
import { connectToDatabase } from '@/lib/db'
import BlogPost from '@/models/BlogPost'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { effectiveStatus, statusQuery } from '@/lib/blog/status'
import { renderTiptapHtml } from '@/lib/blog/renderTiptap'
import { pickRelated } from '@/lib/blog/related'
import { BLOG_SORT_INDEX, ensureBlogSortIndex } from '@/lib/blog/sortIndex'
import { blogJsonLd, blogMetadata } from '@/lib/seo/blog'
import { renderPublicMarkdown, validIsoDate } from '@/lib/seo/publicContent'
import BlogPageClient from './BlogPageClient'
import { omitRejectedPhoto } from '@/lib/blog/excludedPhoto'
import { programmePostCopy, programmeHtmlCopy } from '@/lib/blog/programmeCopy'

export const dynamic = 'force-dynamic'

async function viewerIsAdmin() {
    try {
        const { userId } = await auth()
        if (!userId) return false
        return await checkAdminPrivileges(userId)
    } catch {
        return false
    }
}

export default async function BlogPage({ params }) {
    const { blogSlug } = await params
    await connectToDatabase()
    const post = programmePostCopy(await BlogPost.findOne({ slug: blogSlug }).lean())
    if (!post) notFound()

    const status = effectiveStatus(post)
    const isPublished = status === 'published'
    let preview = false
    if (!isPublished && status !== 'unlisted') {
        if (!(await viewerIsAdmin())) notFound()
        preview = true
    }

    const contentHtml = programmeHtmlCopy(omitRejectedPhoto(post.contentFormat === 'tiptap'
        ? renderTiptapHtml(post.contentJson) : renderPublicMarkdown(post.content)), blogSlug)

    await ensureBlogSortIndex()
    const pool = await BlogPost.find(statusQuery('published'))
        .select('title slug excerpt heroImage categories publishDate readingTimeMinutes')
        .sort({ publishDate: -1 })
        .hint(BLOG_SORT_INDEX)
        .limit(50)
        .lean()
    const related = pickRelated(post, pool.map(programmePostCopy), 3)

    // Pass display fields only. Edited rich text must never fall back to an
    // old imported source that can include subsequently removed information.
    const publicFields = ['_id', 'title', 'slug', 'excerpt', 'heroImage', 'cta', 'tags', 'categories', 'publishDate', 'readingTimeMinutes', 'authorName']
    const safePost = JSON.parse(JSON.stringify(Object.fromEntries(publicFields
        .filter(field => post[field] !== undefined).map(field => [field, post[field]]))))
    if (blogSlug === '3d-printer-repair') safePost.cta = { ...(safePost.cta || {}), tag: 'Printer repair', text: 'Request a printer assessment', url: '/printer-repair' }
    safePost.publishDateFormatted = validIsoDate(post.publishDate)
        ? new Date(post.publishDate).toLocaleDateString('en-GB', { timeZone: 'UTC' }) : null
    if (!validIsoDate(post.publishDate)) safePost.publishDate = null
    const safeRelated = JSON.parse(JSON.stringify(related))

    return <>
        {isPublished && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(blogJsonLd(post)) }} />}
        <BlogPageClient post={safePost} contentHtml={contentHtml} related={safeRelated} preview={preview} />
    </>
}

export async function generateMetadata({ params }) {
    const { blogSlug } = await params
    await connectToDatabase()
    const post = await BlogPost.findOne({ slug: blogSlug, $or: [statusQuery('published'), { status: 'unlisted' }] }).lean()
    return blogMetadata(programmePostCopy(post))
}
