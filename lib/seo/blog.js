import { absoluteUrl, SITE_URL } from './site'
import { buildPageMetadata } from './metadata'
import { contentDescription, validIsoDate } from './publicContent'
import { extractTextFromTiptap } from '@/lib/blog/tiptapText'
import { effectiveStatus } from '@/lib/blog/status'

export function blogImageUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return absoluteUrl('/fitogimage.png')
    const image = value.trim()
    return /^https?:\/\//i.test(image) || image.startsWith('/')
        ? absoluteUrl(image) : absoluteUrl(`/api/proxy?key=${encodeURIComponent(image)}`)
}

export function blogDescription(post) {
    // Edited rich text replaces the legacy source, including for search snippets.
    const body = post.contentFormat === 'tiptap' ? extractTextFromTiptap(post.contentJson) : post.content
    return contentDescription(post.metaDescription || post.excerpt || body) || `Read ${post.title} on the Fix It Today blog.`
}

export function blogMetadata(post) {
    if (!post || effectiveStatus(post) !== 'published') return { title: 'Article unavailable | Fix It Today', robots: { index: false, follow: false } }
    const metadata = buildPageMetadata({
        title: post.metaTitle?.trim() || `${post.title} | Fix It Today`,
        description: blogDescription(post),
        path: `/blog/${encodeURIComponent(post.slug)}`,
        image: blogImageUrl(post.heroImage),
        type: 'article',
    })
    metadata.openGraph.publishedTime = validIsoDate(post.publishDate)
    metadata.openGraph.modifiedTime = validIsoDate(post.updatedAt)
    return metadata
}

export function blogJsonLd(post) {
    const url = absoluteUrl(`/blog/${encodeURIComponent(post.slug)}`)
    return {
        '@context': 'https://schema.org', '@type': 'BlogPosting',
        headline: post.title, description: blogDescription(post), image: [blogImageUrl(post.heroImage)],
        url, mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        datePublished: validIsoDate(post.publishDate), dateModified: validIsoDate(post.updatedAt),
        author: post.authorName?.trim() && !post.authorName.startsWith('user_')
            ? { '@type': 'Person', name: post.authorName.trim() }
            : { '@type': 'Organization', name: 'Fix It Today®', url: SITE_URL },
        publisher: { '@type': 'Organization', name: 'Fix It Today®', logo: { '@type': 'ImageObject', url: absoluteUrl('/fitogimage.png') } },
    }
}
