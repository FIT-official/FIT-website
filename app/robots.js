import { SITE_URL } from '@/lib/seo/site'

export default function robots() {
    return {
        rules: {
            userAgent: '*',
            allow: ['/', '/api/proxy'],
            disallow: [
                '/account', '/admin', '/api/', '/cart', '/checkout',
                '/dashboard', '/editor', '/onboarding', '/sign-in', '/sign-up',
            ],
        },
        sitemap: `${SITE_URL}/sitemap.xml`,
    }
}
