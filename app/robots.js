import { SITE_URL } from '@/lib/seo/site'

export default function robots() {
    return {
        rules: {
            userAgent: '*',
            allow: ['/', '/api/proxy'],
            // Google must crawl sign-in, cart and checkout to read their noindex tags.
            disallow: [
                '/account', '/admin', '/api/',
                '/dashboard', '/editor', '/onboarding',
            ],
        },
        sitemap: `${SITE_URL}/sitemap.xml`,
    }
}
