import { connectToDatabase } from '@/lib/db'
import BlogPost from '@/models/BlogPost'
import BlogPageClient from './BlogPageClient'

export default async function BlogPage({ params }) {
    const { blogSlug } = params
    await connectToDatabase()
    const post = await BlogPost.findOne({ slug: blogSlug }).lean()
    if (!post) {
        return (
            <div className="p-8">Not found</div>
        )
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://fixitoday.com'
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
        author: post.authorId
            ? {
                "@type": "Person",
                name: post.authorId,
            }
            : undefined,
        publisher: {
            "@type": "Organization",
            name: "Fix It Today®",
            logo: {
                "@type": "ImageObject",
                url: `${baseUrl}/fitogimage.png`,
            },
        },
    }

    const safePost = JSON.parse(JSON.stringify(post))
    safePost.publishDateFormatted = post.publishDate ? new Date(post.publishDate).toLocaleDateString('en-GB') : null

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <BlogPageClient post={safePost} />
        </>
    )
}

function heroImageIsAbsolute(path) {
    return path.startsWith('http') || path.startsWith('/')
}
export async function generateMetadata({ params }) {
    // `params` can be an async object in Next.js dynamic APIs — await it before use
    const { blogSlug } = await params
    await connectToDatabase()
    const post = await BlogPost.findOne({ slug: blogSlug }).lean()
    if (!post) return { title: 'Blog Post' }
    return {
        title: post.metaTitle || post.title,
        description: post.metaDescription || post.excerpt || '',
        openGraph: {
            title: post.metaTitle || post.title,
            description: post.metaDescription || post.excerpt || '',
            url: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/blog/${post.slug}`,
            images: post.heroImage ? [post.heroImage.startsWith('http') || post.heroImage.startsWith('/') ? post.heroImage : `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/proxy?key=${encodeURIComponent(post.heroImage)}`] : [],
        }
    }
}