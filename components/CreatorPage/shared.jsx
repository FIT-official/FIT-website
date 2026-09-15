'use client'
// Small helpers shared by the creator page blocks and the builder preview.

export const proxySrc = (key) => `/api/proxy?key=${encodeURIComponent(key)}`

export const isLikelyClerkUserId = (value) => typeof value === 'string' && /^user_[a-zA-Z0-9]+$/.test(value)

export const sanitizeDisplayName = (value, fallback = 'Unnamed Store') => {
    if (typeof value !== 'string') return fallback
    const trimmed = value.trim()
    if (!trimmed) return fallback
    if (isLikelyClerkUserId(trimmed)) return fallback
    return trimmed
}

/** Optional block heading; renders nothing for an empty string. */
export function SectionHeading({ children, as: Tag = 'h2' }) {
    if (!children) return null
    return <Tag className="font-semibold text-textColor">{children}</Tag>
}

/** Accent-aware primary button classes (falls back to ink). */
export const accentButtonStyle = (accent) =>
    accent ? { backgroundColor: accent, borderColor: accent } : undefined
