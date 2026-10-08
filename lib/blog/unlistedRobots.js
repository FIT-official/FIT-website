import { unlistedSlugHashes } from './unlistedSlugHashes'

// Edge-safe, with no database lookup. Decode once to match the page route.
export async function isUnlistedBlogPath(pathname, envSlugs = process.env.UNLISTED_BLOG_SLUGS || '', hashes = unlistedSlugHashes) {
    const match = /^\/blog\/([^/]+)\/?$/.exec(pathname)
    if (!match) return false
    let slug
    try { slug = decodeURIComponent(match[1]) } catch { return false }
    if (envSlugs.split(',').map(value => value.trim()).filter(Boolean).includes(slug)) return true
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(slug))
    const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    return hashes.includes(hex)
}
