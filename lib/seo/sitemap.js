import { effectiveStatus } from '@/lib/blog/status'
import { SITE_URL } from '@/lib/seo/site'

// Include public landing pages, not account, editor or checkout flows.
export const SITEMAP_PUBLIC_PATHS = [
    '/', '/about', '/shop', '/prints', '/creators', '/blog', '/privacy', '/terms',
]

export const PUBLIC_PRODUCT_SITEMAP_FILTER = {
    hidden: false,
    flaggedForModeration: { $ne: true },
}

function safeSlug(slug) {
    if (typeof slug !== 'string' || !slug || slug !== slug.trim()) return null
    if (slug === '.' || slug === '..' || /[\/?#\\]/.test(slug)) return null
    return encodeURIComponent(slug)
}

function lastModified(document) {
    for (const value of [document.updatedAt, document.publishDate, document.createdAt]) {
        if (!value) continue
        const date = new Date(value)
        if (Number.isFinite(date.getTime())) return date
    }
    return undefined
}

export function buildPublicSitemap({ products = [], posts = [] } = {}) {
    const entries = new Map(SITEMAP_PUBLIC_PATHS.map(path => {
        const url = `${SITE_URL}${path === '/' ? '' : path}`
        return [url, { url }]
    }))

    function addDocument(prefix, document) {
        const slug = safeSlug(document.slug)
        if (!slug) return
        const url = `${SITE_URL}/${prefix}/${slug}`
        const date = lastModified(document)
        entries.set(url, date ? { url, lastModified: date } : { url })
    }

    for (const product of products) {
        // Also enforce visibility here so an accidentally broader caller/query
        // cannot advertise hidden or moderated records to search engines.
        if (product.hidden !== false || product.flaggedForModeration === true) continue
        addDocument('products', product)
    }
    for (const post of posts) {
        if (effectiveStatus(post) !== 'published') continue
        addDocument('blog', post)
    }
    return [...entries.values()]
}
