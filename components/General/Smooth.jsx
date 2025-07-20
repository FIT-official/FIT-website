'use client'

import { useEffect, useRef } from 'react'
import Lenis from 'lenis'

export default function Smooth({ children }) {
    const lenisRef = useRef(null)

    useEffect(() => {
        const lenis = new Lenis()
        lenisRef.current = lenis

        function raf(time) {
            lenis.raf(time)
            requestAnimationFrame(raf)
        }

        requestAnimationFrame(raf)

        return () => {
            lenis.destroy()
            lenisRef.current = null
        }
    }, [])

    return <>{children}</>
}