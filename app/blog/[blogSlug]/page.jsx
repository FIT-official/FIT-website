import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { jsonLdString } from '@/lib/jsonLd'
import { connectToDatabase } from '@/lib/db'
import BlogPost from '@/models/BlogPost'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { effectiveStatus, statusQuery } from '@/lib/blog/status'
import { SITE_URL, absoluteUrl } from '@/lib/seo/site'
import { renderTiptapHtml } from '@/lib/blog/renderTiptap'
import { pickRelated } from '@/lib/blog/related'
import { BLOG_SORT_INDEX, ensureBlogSortIndex } from '@/lib/blog/sortIndex'
import BlogPageClient from './BlogPageClient'

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
    const post = await BlogPost.findOne({ slug: blogSlug }).lean()
    if (!post) notFound()

    // Unpublished posts are visible only to admins (editor preview).
    const isPublished = effectiveStatus(post) === 'published'
    let preview = false
    if (!isPublished) {
        if (!(await viewerIsAdmin())) notFound()
        preview = true
    }

    const baseUrl = SITE_URL
    const postUrl = `${baseUrl}/blog/${post.slug}`
    const heroImage = post.heroImage
        ? (heroImageIsAbsolute(post.heroImage)
            ? post.heroImage
            : `${baseUrl}/api/proxy?key=${encodeURIComponent(post.heroImage)}`)
        : `${baseUrl}/fitogimage.png`

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.metaTitle || post.title,
        description: post.metaDescription || post.excerpt || '',
        image: heroImage ? [heroImage] : undefined,
        url: postUrl,
        mainEntityOfPage: {
            "@type": "WebPage",
            "@id": postUrl,
        },
        datePublished: post.publishDate ? new Date(post.publishDate).toISOString() : undefined,
        dateModified: post.updatedAt ? new Date(post.updatedAt).toISOString() : undefined,
        author: post.authorName?.trim() && !post.authorName.startsWith('user_')
            ? { "@type": "Person", name: post.authorName.trim() }
            : { "@type": "Organization", name: "Fix It Today®", url: SITE_URL },
        publisher: {
            "@type": "Organization",
            name: "Fix It Today®",
            logo: {
                "@type": "ImageObject",
                url: `${baseUrl}/fitogimage.png`,
            },
        },
    }

    // Rich-text posts render to HTML on the server; legacy markdown renders client-side.
    const contentHtml = post.contentFormat === 'tiptap' ? renderTiptapHtml(post.contentJson) : null

    // Related: same category first, padded with recent.
    await ensureBlogSortIndex()
    const pool = await BlogPost.find({ published: true })
        .select('title slug excerpt heroImage categories publishDate readingTimeMinutes')
        .sort({ publishDate: -1 })
        .hint(BLOG_SORT_INDEX)
        .limit(50)
        .lean()
    const related = pickRelated(post, pool, 3)

    const safePost = JSON.parse(JSON.stringify(post))
    safePost.publishDateFormatted = post.publishDate ? new Date(post.publishDate).toLocaleDateString('en-GB') : null
    const safeRelated = JSON.parse(JSON.stringify(related))

    return (
        <>
            {!preview && <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
            />}
            <BlogPageClient post={safePost} contentHtml={contentHtml} related={safeRelated} preview={preview} />
        </>
    )
}

function heroImageIsAbsolute(path) {
    return path.startsWith('http') || path.startsWith('/')
}

export async function generateMetadata({ params }) {
    const { blogSlug } = await params
    await connectToDatabase()
    const post = await BlogPost.findOne({ slug: blogSlug, ...statusQuery('published') }).lean()
    if (!post) return { title: 'Blog Post', robots: { index: false, follow: false } }
    return {
        title: post.metaTitle || post.title,
        description: post.metaDescription || post.excerpt || '',
        alternates: { canonical: absoluteUrl(`/blog/${encodeURIComponent(post.slug)}`) },
        openGraph: {
            title: post.metaTitle || post.title,
            description: post.metaDescription || post.excerpt || '',
            url: absoluteUrl(`/blog/${encodeURIComponent(post.slug)}`),
            type: 'article',
            images: post.heroImage ? [post.heroImage.startsWith('http') || post.heroImage.startsWith('/') ? absoluteUrl(post.heroImage) : absoluteUrl(`/api/proxy?key=${encodeURIComponent(post.heroImage)}`)] : [],
        }
    }
}
