'use client'

import { useEffect, useState } from 'react'

export default function HeroVideo({ src, poster, className }) {
    const [allowed, setAllowed] = useState(false)
    useEffect(() => {
        if (!src) return
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
        const connection = navigator.connection
        const update = () => setAllowed(!motion.matches && !connection?.saveData)
        update()
        motion.addEventListener('change', update)
        connection?.addEventListener?.('change', update)
        return () => {
            motion.removeEventListener('change', update)
            connection?.removeEventListener?.('change', update)
        }
    }, [src])
    if (!src || !allowed) return null
    return <video className={className} autoPlay muted loop playsInline preload="metadata" poster={poster} aria-hidden="true">
        <source src={src} />
    </video>
}
