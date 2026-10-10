// Shared with middleware; keep this module free of Node APIs and service SDKs.
export const DRAFT_SHELL_HEADER = 'x-fit-blog-draft-shell'

export function isDraftPath(pathname) {
    return pathname === '/blog/drafts' || pathname.startsWith('/blog/drafts/')
}

export function isDraftPreview() {
    return process.env.VERCEL_ENV === 'preview'
        || (process.env.NODE_ENV !== 'production' && process.env.BLOG_DRAFTS_PREVIEW === '1')
}
