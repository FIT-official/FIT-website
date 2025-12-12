"use client"
import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { IoArrowForward } from 'react-icons/io5'

function FeaturedCarousel({ posts }) {
    const [index, setIndex] = useState(0)

    if (!posts || posts.length === 0) return null

    const current = posts[index]

    const next = () => setIndex((prev) => (prev + 1) % posts.length)
    const prev = () => setIndex((prev) => (prev - 1 + posts.length) % posts.length)

    return (
        <section className="w-full flex flex-col items-center mb-10">
            <div className="w-full max-w-5xl bg-baseColor border border-borderColor rounded-lg shadow-sm overflow-hidden flex flex-col md:flex-row">
                {current.heroImage && (
                    <div className="relative w-full md:w-1/2 h-56 md:h-72 border-b md:border-b-0 md:border-r border-borderColor">
                        <Image
                            src={current.heroImage.startsWith('http') || current.heroImage.startsWith('/') ? current.heroImage : `/api/proxy?key=${encodeURIComponent(current.heroImage)}`}
                            alt={current.title}
                            fill
                            className="object-cover"
                        />
                    </div>
                )}
                <div className="flex-1 p-6 md:p-8 flex flex-col justify-between gap-4">
                    <div className="flex flex-col gap-2">
                        {current.tags && current.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-lightColor">
                                {current.tags.slice(0, 3).map(tag => (
                                    <span key={tag} className="px-2 py-0.5 border border-borderColor rounded-full">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                        <Link href={`/blog/${encodeURIComponent(current.slug)}`} className="group">
                            <h2 className="text-xl md:text-2xl font-semibold text-textColor mb-1 group-hover:underline">
                                {current.title}
                            </h2>
                        </Link>
                        {current.excerpt && (
                            <p className="text-xs md:text-sm text-lightColor max-w-xl">
                                {current.excerpt}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-extraLight">
                        <div>
                            {current.publishDateFormatted && (
                                <span>{current.publishDateFormatted}</span>
                            )}
                            {current.readingTimeMinutes && (
                                <span>{current.publishDateFormatted ? ' • ' : ''}{current.readingTimeMinutes} min read</span>
                            )}
                        </div>
                        <Link
                            href={`/blog/${encodeURIComponent(current.slug)}`}
                            className="flex items-center gap-1 text-xs font-medium text-textColor hover:gap-2 transition-all"
                        >
                            Read article
                            <IoArrowForward />
                        </Link>
                    </div>
                </div>
            </div>

            {posts.length > 1 && (
                <div className="flex items-center gap-2 mt-4 text-[11px] text-extraLight">
                    <button
                        type="button"
                        onClick={prev}
                        className="px-2 py-1 border border-borderColor rounded-md bg-background hover:bg-borderColor/30 transition text-xs"
                    >
                        Prev
                    </button>
                    <span>
                        {index + 1} / {posts.length}
                    </span>
                    <button
                        type="button"
                        onClick={next}
                        className="px-2 py-1 border border-borderColor rounded-md bg-background hover:bg-borderColor/30 transition text-xs"
                    >
                        Next
                    </button>
                </div>
            )}
        </section>
    )
}

function BlogList({ posts }) {
    if (!posts || posts.length === 0) {
        return (
            <div className="w-full max-w-5xl text-xs text-lightColor mt-8 text-center">
                No blog posts yet.
            </div>
        )
    }

    const [query, setQuery] = useState('')
    const [activeTag, setActiveTag] = useState('')

    const allTags = Array.from(new Set((posts || []).flatMap(p => p.tags || [])))

    const filtered = (posts || []).filter(post => {
        const matchesQuery = query.trim()
            ? (post.title || '').toLowerCase().includes(query.toLowerCase()) ||
              (post.excerpt || '').toLowerCase().includes(query.toLowerCase())
            : true
        const matchesTag = activeTag ? (post.tags || []).includes(activeTag) : true
        return matchesQuery && matchesTag
    })

    return (
        <section className="w-full max-w-5xl mt-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                <h2 className="text-sm font-medium text-textColor uppercase tracking-wide">All posts</h2>
                <div className="flex flex-col md:flex-row gap-2 md:items-center w-full md:w-auto">
                    <div className="flex-1 md:flex-none">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search by title or excerpt"
                            className="formInput text-xs md:text-sm"
                        />
                    </div>
                    {allTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 md:justify-end">
                            <button
                                type="button"
                                onClick={() => setActiveTag('')}
                                className={`px-2 py-1 rounded-full text-[10px] uppercase tracking-wide border border-borderColor transition-colors ${
                                    !activeTag ? 'bg-textColor text-background' : 'bg-background text-lightColor hover:bg-borderColor/20'
                                }`}
                            >
                                All
                            </button>
                            {allTags.map(tag => (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => setActiveTag(tag === activeTag ? '' : tag)}
                                    className={`px-2 py-1 rounded-full text-[10px] uppercase tracking-wide border border-borderColor transition-colors ${
                                        activeTag === tag
                                            ? 'bg-textColor text-background'
                                            : 'bg-background text-lightColor hover:bg-borderColor/20'
                                    }`}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="flex flex-col divide-y divide-borderColor border border-borderColor rounded-lg bg-background overflow-hidden">
                {filtered.map(post => (
                    <Link
                        key={post._id}
                        href={`/blog/${encodeURIComponent(post.slug)}`}
                        className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4 px-4 md:px-6 py-4 hover:bg-borderColor/20 transition-colors"
                    >
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <p className="text-xs font-semibold text-textColor truncate max-w-xs md:max-w-sm">
                                    {post.title}
                                </p>
                                {post.featured && (
                                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-textColor text-background">
                                        Featured
                                    </span>
                                )}
                            </div>
                            {post.excerpt && (
                                <p className="text-[11px] text-lightColor truncate max-w-md">
                                    {post.excerpt}
                                </p>
                            )}
                        </div>
                        <div className="flex flex-col items-end gap-1 text-[11px] text-extraLight min-w-[120px]">
                            {post.publishDateFormatted && (
                                <span>{post.publishDateFormatted}</span>
                            )}
                            {post.readingTimeMinutes && (
                                <span>{post.readingTimeMinutes} min read</span>
                            )}
                            {post.tags && post.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 justify-end max-w-[140px]">
                                    {post.tags.slice(0, 2).map(tag => (
                                        <span
                                            key={tag}
                                            className="px-1.5 py-0.5 border border-borderColor rounded-full text-[10px] uppercase tracking-wide"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </Link>
                ))}

                {filtered.length === 0 && (
                    <div className="px-4 md:px-6 py-8 text-center text-xs text-lightColor">
                        No posts match your search.
                    </div>
                )}
            </div>
        </section>
    )
}

function Blog() {
    const [featured, setFeatured] = useState([])
    const [allPosts, setAllPosts] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch('/api/admin/blog')
                const data = await res.json()
                if (!data.ok) return

                const all = (data.posts || []).filter(p => p.published)

                const featuredPosts = all.filter(p => p.featured)

                // compute formatted dates client-side if present
                const format = (post) => ({
                    ...post,
                    publishDateFormatted: post.publishDate
                        ? new Date(post.publishDate).toLocaleDateString('en-GB')
                        : null
                })

                setFeatured(featuredPosts.map(format))
                setAllPosts(all.map(format))
            } finally {
                setLoading(false)
            }
        }

        load()
    }, [])

    return (
        <div className="min-h-[92vh] flex flex-col items-center pt-12 pb-24 border-b border-borderColor bg-borderColor/40">
            <div className="w-full max-w-5xl px-6 md:px-4 flex flex-col items-center mb-8">
                <p className="text-[10px] uppercase tracking-[0.2em] text-lightColor mb-2">Insights & Stories</p>
                <h1 className="text-center mb-2">Blog</h1>
                <p className="text-xs md:text-sm text-lightColor max-w-xl text-center">
                    Learn more about 3D printing, digital products, and updates from the FIT team.
                </p>
            </div>

            {loading ? (
                <div className="loader" />
            ) : (
                <>
                    <FeaturedCarousel posts={featured.length > 0 ? featured : allPosts.slice(0, 3)} />
                    <BlogList posts={allPosts} />
                </>
            )}
        </div>
    )
}

export default Blog