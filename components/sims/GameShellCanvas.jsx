'use client'

import { useEffect, useRef, useState } from 'react'
import { celebrationParticles, drawBackdrop, drawCelebration } from '@/lib/sims/canvas'

export default function GameShellCanvas({ accent, celebration = 0, reducedMotion = false }) {
  const host = useRef(null)
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)))
    if (host.current) observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    const canvas = ref.current
    const context = canvas.getContext('2d')
    if (!context) return
    let frame = 0
    function paint() {
      const width = canvas.clientWidth || 320
      const height = 88
      const scale = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = width * scale
      canvas.height = height * scale
      context.setTransform(scale, 0, 0, scale, 0, 0)
      drawBackdrop(context, width, height, accent)
      return { width, height }
    }
    const { width, height } = paint()
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(paint) : null
    resize?.observe(canvas)
    if (celebration > 0 && !reducedMotion) {
      const particles = celebrationParticles(width, height)
      const start = performance.now()
      const animate = now => {
        const seconds = (now - start) / 1000
        drawBackdrop(context, width, height, accent)
        drawCelebration(context, particles, seconds)
        if (seconds < 1.2) frame = requestAnimationFrame(animate)
      }
      frame = requestAnimationFrame(animate)
    }
    return () => { cancelAnimationFrame(frame); resize?.disconnect() }
  }, [accent, celebration, reducedMotion, visible])
  return <div ref={host} aria-hidden="true" style={{ height: 88 }}>{visible && <canvas ref={ref} style={{ display: 'block', width: '100%', height: 88 }} />}</div>
}
