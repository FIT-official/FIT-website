'use client'
// Public creator directory (/creators): search box, one card per published
// creator page (logo, name, short description, product count) linking to
// /creators/<name>, pagination, and an empty state. Pricing moved to
// /creators/join; the header keeps a quiet CTA to it.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { GoSearch, GoArrowRight } from 'react-icons/go'

const proxySrc = (key) => `/api/proxy?key=${encodeURIComponent(key)}`

function CreatorCard({ creator }) {
    const href = `/creators/${encodeURIComponent(creator.slug || creator.userId)}`
    const accent = creator.accentColor || ''
    const count = creator.productCount || 0
    return (
        <Link
            href={href}
            className="group flex flex-col rounded-md border border-borderColor bg-background overflow-hidden hover:bg-baseColor transition-colors duration-300"
        >
            <div
                className="relative h-20 w-full bg-baseColor"
                style={accent && !creator.bannerImage ? { backgroundColor: `${accent}14` } : undefined}
            >
                {creator.bannerImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxySrc(creator.bannerImage)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                )}
            </div>
            <div className="relative flex flex-col gap-2 px-4 pb-4 -mt-6">
                <div className="h-12 w-12 rounded-full border border-borderColor bg-background overflow-hidden flex items-center justify-center">
                    {creator.logoImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={proxySrc(creator.logoImage)} alt={`${creator.displayName} logo`} className="h-full w-full object-cover" />
                    ) : (
                        <span className="text-lg font-semibold text-lightColor select-none">
                            {creator.displayName.charAt(0).toUpperCase()}
                        </span>
                    )}
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm font-semibold text-textColor truncate">{creator.displayName}</span>
                    <span className="text-xs text-lightColor line-clamp-2 min-h-[2rem]">
                        {creator.description || 'Creator on Fix It Today®'}
                    </span>
                </div>
                <div className="flex items-center justify-between text-xs text-lightColor">
                    <span>{count} {count === 1 ? 'product' : 'products'}</span>
                    <span className="flex items-center gap-1 group-hover:text-textColor transition-colors duration-300">
                        View page <GoArrowRight aria-hidden="true" />
                    </span>
                </div>
            </div>
        </Link>
    )
}

export default function CreatorsDirectory() {
    const [query, setQuery] = useState('')
    const [debounced, setDebounced] = useState('')
    const [page, setPage] = useState(1)
    const [creators, setCreators] = useState([])
    const [total, setTotal] = useState(0)
    const [hasMore, setHasMore] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        const t = setTimeout(() => {
            setDebounced(query.trim())
            setPage(1)
        }, 250)
        return () => clearTimeout(t)
    }, [query])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            setLoading(true)
            setError('')
            try {
                const params = new URLSearchParams({ page: String(page) })
                if (debounced) params.set('q', debounced)
                const res = await fetch(`/api/creators?${params.toString()}`)
                const data = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(data.error || 'Failed to load creators')
                if (!cancelled) {
                    setCreators(Array.isArray(data.creators) ? data.creators : [])
                    setTotal(Number(data.total) || 0)
                    setHasMore(Boolean(data.hasMore))
                }
            } catch (err) {
                if (!cancelled) setError(err?.message || 'Failed to load creators')
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [debounced, page])

    return (
        <div className="flex flex-col min-h-[92vh] w-full items-center justify-start border-b border-borderColor py-16 px-4 md:px-8">
            <div className="flex flex-col w-full max-w-6xl gap-8">
                <div className="flex flex-col md:flex-row md:items-end gap-4">
                    <div className="flex flex-col gap-2 flex-1">
                        <h3>Creators</h3>
                        <h1>Meet the makers</h1>
                        <p className="text-sm text-lightColor max-w-xl">
                            Independent designers and print shops selling on Fix It Today®. Browse their pages, buy their work, or ask them to print yours.
                        </p>
                    </div>
                    <Link
                        href="/creators/join"
                        className="flex items-center gap-1.5 w-fit rounded-full border border-borderColor bg-background px-4 py-2 text-xs font-medium text-textColor hover:bg-baseColor transition-colors duration-300"
                    >
                        Become a creator
                        <GoArrowRight aria-hidden="true" />
                    </Link>
                </div>

                <label className="flex items-center gap-2 w-full md:max-w-md rounded-full border border-borderColor bg-background px-4 py-2">
                    <GoSearch aria-hidden="true" className="text-lightColor shrink-0" />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search creators by name"
                        aria-label="Search creators"
                        className="w-full bg-transparent text-sm focus:outline-none"
                    />
                </label>

                {error ? (
                    <div className="flex w-full items-center justify-center border border-borderColor rounded-sm py-16">
                        <div className="text-sm text-lightColor">{error}</div>
                    </div>
                ) : loading ? (
                    <div className="grid w-full lg:grid-cols-4 md:grid-cols-2 grid-cols-1 gap-6" aria-busy="true">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-48 rounded-md border border-borderColor bg-baseColor animate-pulse" />
                        ))}
                    </div>
                ) : creators.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 w-full border border-borderColor rounded-sm py-16">
                        <div className="text-sm text-textColor font-medium">
                            {debounced ? `No creators match "${debounced}".` : 'No creator pages yet.'}
                        </div>
                        <div className="text-xs text-lightColor">
                            {debounced ? 'Try a different name.' : 'Be the first: set up your page from the creator dashboard.'}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="grid w-full lg:grid-cols-4 md:grid-cols-2 grid-cols-1 gap-6">
                            {creators.map((c) => (
                                <CreatorCard key={c.userId} creator={c} />
                            ))}
                        </div>
                        {(page > 1 || hasMore) && (
                            <div className="flex items-center justify-between text-xs text-lightColor">
                                <span>{total} {total === 1 ? 'creator' : 'creators'}</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={page <= 1}
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        className="rounded-full border border-borderColor px-3 py-1.5 font-medium text-textColor disabled:opacity-40 hover:bg-baseColor transition-colors duration-300 cursor-pointer disabled:cursor-default"
                                    >
                                        Previous
                                    </button>
                                    <span>Page {page}</span>
                                    <button
                                        type="button"
                                        disabled={!hasMore}
                                        onClick={() => setPage((p) => p + 1)}
                                        className="rounded-full border border-borderColor px-3 py-1.5 font-medium text-textColor disabled:opacity-40 hover:bg-baseColor transition-colors duration-300 cursor-pointer disabled:cursor-default"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
