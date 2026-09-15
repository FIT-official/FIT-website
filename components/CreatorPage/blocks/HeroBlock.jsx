'use client'
// Hero: banner band + overlapping round logo + name/verified chip + a line
// of description, then the stat strip. Headline/subheadline override the
// display name / shop description when set.
import { GoCheckCircleFill } from 'react-icons/go'
import { proxySrc, sanitizeDisplayName } from '../shared'

const averageRating = (products) => {
    let sum = 0
    let count = 0
    for (const p of products) {
        for (const r of p?.reviews || []) {
            const rating = Number(r?.rating)
            if (Number.isFinite(rating)) {
                sum += rating
                count += 1
            }
        }
    }
    if (count === 0) return null
    return Math.round((sum / count) * 10) / 10
}

function Stat({ value, label }) {
    return (
        <div className="flex flex-col items-center gap-1 py-4">
            <span className="text-2xl md:text-3xl font-semibold tracking-tight text-textColor">{value}</span>
            <span className="text-xs text-lightColor">{label}</span>
        </div>
    )
}

export default function HeroBlock({ settings = {}, creator, products = [] }) {
    const shop = creator?.shop || {}
    const displayName = sanitizeDisplayName(creator?.displayName, 'Unnamed Store')
    const headline = settings.headline || displayName
    const subheadline = settings.subheadline || shop.description || 'Creator on Fix It Today®'
    const showBanner = settings.showBanner !== false
    const showLogo = settings.showLogo !== false
    const accent = shop.accentColor || ''
    // Role "Creator" is only ever set for subscribed (or admin) accounts via
    // the display-name flow, so it is a safe derivable signal.
    const isVerified = creator?.role === 'Creator'
    const safeProducts = Array.isArray(products) ? products : []
    const totalLikes = safeProducts.reduce((acc, p) => acc + (p?.likes?.length || 0), 0)
    const avgRating = averageRating(safeProducts)

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col">
                {showBanner && (
                    <div className="relative w-full h-40 md:h-56 rounded-md overflow-hidden border border-borderColor bg-baseColor">
                        {shop.bannerImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={proxySrc(shop.bannerImage)}
                                alt={`${displayName} banner`}
                                className="absolute inset-0 w-full h-full object-cover"
                            />
                        ) : (
                            <div
                                data-testid="banner-fallback"
                                aria-hidden="true"
                                className="absolute inset-0 bg-baseColor"
                                style={accent ? { backgroundColor: `${accent}14` } : undefined}
                            />
                        )}
                    </div>
                )}

                <div className={`relative z-10 flex flex-col md:flex-row md:items-end gap-4 px-4 md:px-6 ${showBanner ? '-mt-10' : ''}`}>
                    {showLogo && (
                        <div
                            className="shrink-0 h-20 w-20 md:h-24 md:w-24 rounded-full border border-borderColor bg-background overflow-hidden flex items-center justify-center"
                            data-testid="shop-logo"
                        >
                            {shop.logoImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={proxySrc(shop.logoImage)}
                                    alt={`${displayName} logo`}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <span className="text-3xl md:text-4xl font-semibold text-lightColor select-none">
                                    {displayName.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>
                    )}

                    <div className="flex flex-col gap-1 pb-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-left leading-tight">{headline}</h1>
                            {isVerified && (
                                <span className="flex items-center gap-1 rounded-full border border-borderColor bg-baseColor px-2.5 py-1 text-xs font-medium text-lightColor whitespace-nowrap">
                                    <GoCheckCircleFill
                                        aria-hidden="true"
                                        style={accent ? { color: accent } : undefined}
                                        className={accent ? undefined : 'text-textColor'}
                                    />
                                    Verified creator
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-lightColor max-w-2xl whitespace-pre-line">{subheadline}</p>
                    </div>
                </div>
            </div>

            <div
                data-testid="stat-strip"
                className="grid grid-cols-2 md:grid-cols-4 border border-borderColor rounded-md bg-background divide-x divide-y md:divide-y-0 divide-borderColor"
            >
                <Stat value={safeProducts.length} label={safeProducts.length === 1 ? 'Product' : 'Products'} />
                <Stat value={totalLikes} label="Likes" />
                <Stat value={avgRating != null ? avgRating.toFixed(1) : '—'} label="Avg rating" />
                <Stat value={creator?.joinedYear || '—'} label="Joined" />
            </div>
        </div>
    )
}
