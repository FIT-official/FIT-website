import { effectiveStatus } from '@/lib/blog/status'
import { SITE_URL } from '@/lib/seo/site'

// Include public landing pages, not account, editor or checkout flows.
export const SITEMAP_PUBLIC_PATHS = [
    '/', '/about', '/shop', '/prints', '/creators', '/creators/join', '/blog', '/privacy', '/terms',
]

// Published creator pages: a shop subdocument, not unpublished, and a real
// display name (the pretty /creators/<name> slug).
export const PUBLIC_CREATOR_SITEMAP_FILTER = {
    shop: { $exists: true, $ne: null },
    'shop.published': { $ne: false },
    'metadata.displayName': { $exists: true, $type: 'string', $ne: '' },
}

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

export function buildPublicSitemap({ products = [], posts = [], creators = [] } = {}) {
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
    for (const creator of creators) {
        if (!creator?.shop || creator.shop.published === false) continue
        const name = creator?.metadata?.displayName
        if (typeof name !== 'string' || !name.trim() || /^user_[a-zA-Z0-9]+$/.test(name.trim())) continue
        addDocument('creators', { slug: name.trim() })
    }
    return [...entries.values()]
}
