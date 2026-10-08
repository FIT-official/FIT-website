import { jsonLdString } from '@/lib/jsonLd'
import { blogJsonLd, blogMetadata } from '@/lib/seo/blog'
import { workshopPost, workshopArticleHtml } from '@/lib/blog/designThinkingWorkshop'
import BlogPageClient from '../[blogSlug]/BlogPageClient'
export const metadata = blogMetadata(workshopPost)
export default function DesignThinkingWorkshop() {
    return <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(blogJsonLd(workshopPost)) }} />
        <BlogPageClient post={{ ...workshopPost, publishDateFormatted: '8 October 2026' }} contentHtml={workshopArticleHtml()} />
    </>
}
