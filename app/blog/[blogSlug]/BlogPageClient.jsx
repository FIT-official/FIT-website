"use client"
import { useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import MarkdownRenderer from '@/components/General/MarkdownRenderer'
import CTALink from '@/components/General/CTALink'
import posthog from 'posthog-js'

function imageSrc(path) {
    if (!path) return null
    return path.startsWith('http') || path.startsWith('/') ? path : `/api/proxy?key=${encodeURIComponent(path)}`
}

export default function BlogPageClient({ post, contentHtml, related = [], preview = false }) {
    const slug = post?.slug

    useEffect(() => {
        if (!slug || preview) return
        posthog.capture('blog_post_viewed', {
            slug,
            title: post.title,
            reading_time_minutes: post.readingTimeMinutes || 0,
            has_cta: !!(post.cta && (post.cta.tag || post.cta.text || post.cta.url)),
            related_count: related.length,
        })
        // Capture once per post view, not on unrelated prop changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug, preview])

    if (!post) return <div className="p-8">Not found</div>

    const hasCTA = !!(post.cta && (post.cta.tag || post.cta.text || post.cta.url))

    const authorLabel = (() => {
        if (post.authorName && post.authorName.trim()) return post.authorName
        if (post.author && typeof post.author === 'object') {
            const candidate = post.author.firstName || post.author.name || post.author.username
            if (candidate && candidate.trim()) return candidate
        }
        return 'Fix It Today'
    })()
    return (
        <div className="min-h-[92vh] flex flex-col items-center pt-12 pb-32 border-b border-borderColor justify-center">
            {preview && (
                <div className="w-full max-w-xl mx-8 mb-8 border border-amber-300 bg-amber-50 text-amber-800 rounded-md px-4 py-2 text-xs text-center">
                    Preview — this post is not published. Only admins can see this page.
                </div>
            )}
            <div className="flex flex-col items-center justify-center px-8 md:px-12">
                {hasCTA && (
                    <span onClickCapture={() => posthog.capture('blog_cta_clicked', { slug: post.slug, cta_url: post.cta?.url })}>
                        <CTALink tag={post.cta?.tag} text={post.cta?.text} url={post.cta?.url} />
                    </span>
                )}
                <h1 className="flex max-w-md text-center items-center justify-center mt-3 mb-4">
                    {post.title}
                </h1>
                <p className="text-xs font-medium text-lightColor flex mb-8">
                    By {authorLabel}{post.publishDateFormatted ? `, ${post.publishDateFormatted}` : (post.publishDate ? `, ${new Date(post.publishDate).toISOString().slice(0, 10)}` : '')}
                    {post.readingTimeMinutes ? ` · ${post.readingTimeMinutes} min read` : ''}
                </p>

                <div className="flex text-sm text-center w-3/4 md:w-1/2 items-center mb-12 justify-center">
                    {post.excerpt}
                </div>

            </div>
            <div className="flex w-[90%] md:w-3/5 flex-col gap-8 text-left">
                {post.heroImage ? (
                    <Image
                        src={imageSrc(post.heroImage)}
                        width={800}
                        height={400}
                        alt={post.title}
                        sizes="(max-width: 768px) 90vw, 60vw"
                        className="w-full h-auto max-h-[36rem] object-contain rounded-md border border-borderColor"
                    />
                ) : null}
                <div className="prose max-w-none">
                    {typeof contentHtml === 'string' ? (
                        <div dangerouslySetInnerHTML={{ __html: contentHtml }} />
                    ) : (
                        <MarkdownRenderer source={post.content} />
                    )}
                </div>
            </div>

            {related.length > 0 && (
                <div className="flex w-[90%] md:w-3/5 flex-col mt-16">
                    <h2 className="text-sm font-medium text-textColor uppercase tracking-wide mb-3">Related articles</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {related.map((r) => (
                            <Link
                                key={r.slug}
                                href={`/blog/${encodeURIComponent(r.slug)}`}
                                className="border border-borderColor rounded-md overflow-hidden hover:bg-baseColor transition-colors"
                            >
                                {r.heroImage && (
                                    <div className="relative w-full h-28 border-b border-borderColor">
                                        <Image src={imageSrc(r.heroImage)} alt={r.title} fill className="object-cover" />
                                    </div>
                                )}
                                <div className="p-3">
                                    <p className="text-xs font-semibold text-textColor mb-1">{r.title}</p>
                                    {r.excerpt && <p className="text-[11px] text-lightColor line-clamp-2">{r.excerpt}</p>}
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
