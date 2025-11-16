"use client"
import Image from 'next/image'
import MarkdownRenderer from '@/components/General/MarkdownRenderer'
import CTALink from '@/components/General/CTALink'

export default function BlogPageClient({ post }) {
    if (!post) return <div className="p-8">Not found</div>
    return (
        <div className="min-h-[92vh] flex flex-col items-center pt-12 pb-32 border-b border-borderColor justify-center">
            <div className="flex flex-col items-center justify-center px-8 md:px-12">
                <CTALink tag={post.cta?.tag} text={post.cta?.text} url={post.cta?.url} />
                <h1 className="flex max-w-md text-center items-center justify-center mt-3 mb-4">
                    {post.title}
                </h1>
                <p className="text-xs font-medium text-lightColor flex mb-8">
                    By {post.authorId || 'Admin'}{post.publishDateFormatted ? `, ${post.publishDateFormatted}` : (post.publishDate ? `, ${new Date(post.publishDate).toISOString().slice(0, 10)}` : '')}
                </p>

                <div className="flex text-sm text-center w-3/4 md:w-1/2 items-center mb-12 justify-center">
                    {post.excerpt}
                </div>

            </div>
            <div className="flex w-3/5 flex-col gap-8 text-justify">
                {post.heroImage ? (
                    <Image
                        src={post.heroImage.startsWith('http') || post.heroImage.startsWith('/') ? post.heroImage : `/api/proxy?key=${encodeURIComponent(post.heroImage)}`}
                        width={800}
                        height={400}
                        alt={post.title}
                        className="rounded-md border border-borderColor aspect-video"
                    />
                ) : null}
                <div className="prose max-w-none">
                    <MarkdownRenderer source={post.content} />
                </div>

            </div>
        </div>
    )
}
