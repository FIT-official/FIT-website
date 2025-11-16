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

    const safePost = JSON.parse(JSON.stringify(post))
    safePost.publishDateFormatted = post.publishDate ? new Date(post.publishDate).toLocaleDateString('en-GB') : null
    return <BlogPageClient post={safePost} />
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