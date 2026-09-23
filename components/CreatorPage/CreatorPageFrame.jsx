'use client'
// Theme wrapper for a creator page. The storefront palette lives in CSS
// variables (app/globals.css: --background, --textColor, --light,
// --borderColor, --baseColor, --extraLight) that Tailwind's tokens reference
// inline, so a dark page is simply those variables redefined on this
// element; every block below inherits. The accent is exposed as
// --creator-accent for the small highlights (verified tick, buttons).
import { normalizeTheme } from '@/lib/creatorPage/blocks'

const DARK_VARS = {
    '--background': '#111111',
    '--textColor': '#f5f5f5',
    '--light': '#a3a3a3',
    '--borderColor': '#2a2a2a',
    '--baseColor': '#181818',
    '--extraLight': '#5c5c5c',
}

const FONT_CLASS = {
    sans: 'font-sans',
    serif: 'font-serif',
    mono: 'font-mono',
}

export function themeStyle(theme, accentColor) {
    const { mode } = normalizeTheme(theme)
    const style = mode === 'dark' ? { ...DARK_VARS } : {}
    if (accentColor) style['--creator-accent'] = accentColor
    return style
}

export default function CreatorPageFrame({ theme, accentColor, className = '', children, ...rest }) {
    const normalized = normalizeTheme(theme)
    return (
        <div
            data-theme={normalized.mode}
            data-font={normalized.font}
            className={`${FONT_CLASS[normalized.font] || FONT_CLASS.sans} bg-background text-textColor ${className}`}
            style={themeStyle(normalized, accentColor)}
            {...rest}
        >
            {children}
        </div>
    )
}
