import { SITE_URL } from '@/lib/seo/site'

// Crawlers may retain the old next-sitemap child URL after deployment.
export function GET() {
    return Response.redirect(`${SITE_URL}/sitemap.xml`, 308)
}
