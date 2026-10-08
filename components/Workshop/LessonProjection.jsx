'use client'
import { useEffect, useRef, useState } from 'react'
import styles from './LessonProjection.module.css'

export default function LessonProjection({ deck }) {
    const [index, setIndex] = useState(0), [scale, setScale] = useState(0.5), [message, setMessage] = useState('')
    const root = useRef(null), viewport = useRef(null)
    const last = deck.slides.length - 1, slide = deck.slides[index]
    useEffect(() => {
        const element = viewport.current
        const resize = () => setScale(Math.max(0.1, Math.min(element.clientWidth / deck.canvas.width, element.clientHeight / deck.canvas.height)))
        resize()
        const observer = new ResizeObserver(resize)
        observer.observe(element)
        return () => observer.disconnect()
    }, [deck.canvas.width, deck.canvas.height])
    useEffect(() => {
        const key = event => {
            if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return
            if (['ArrowRight', 'PageDown'].includes(event.key)) { event.preventDefault(); setIndex(value => Math.min(last, value + 1)) }
            if (['ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); setIndex(value => Math.max(0, value - 1)) }
            if (event.key === 'Home') { event.preventDefault(); setIndex(0) }
            if (event.key === 'End') { event.preventDefault(); setIndex(last) }
        }
        window.addEventListener('keydown', key)
        return () => window.removeEventListener('keydown', key)
    }, [last])
    async function fullscreen() {
        const fallback = 'Press F11 on Windows, or use your browser\'s full-screen menu. The slide view is ready to project.'
        try {
            if (document.fullscreenElement) await document.exitFullscreen()
            else if (root.current.requestFullscreen) await root.current.requestFullscreen()
            else { setMessage(fallback); return }
            setMessage('')
        } catch { setMessage(fallback) }
    }
    return <main ref={root} className={styles.root} aria-label="Lesson instructions">
        <div ref={viewport} className={styles.viewport}>
            <div style={{ width: deck.canvas.width * scale, height: deck.canvas.height * scale }}>
                <section className={styles.canvas} aria-label={slide.title} style={{ width: deck.canvas.width, height: deck.canvas.height, transform: `scale(${scale})`, background: deck.theme.background, color: deck.theme.text, fontFamily: deck.theme.fontFamily }}>
                    {slide.blocks.map((block, position) => <div key={`${slide.id}-${position}`} style={{ position: 'absolute', left: block.x, top: block.y, width: block.width, minHeight: block.height, fontSize: block.fontSizePx, fontWeight: block.bold ? 700 : 400, color: block.color, lineHeight: 1.2, whiteSpace: 'pre-wrap' }}>{block.text}</div>)}
                </section>
            </div>
        </div>
        <nav className={styles.controls} aria-label="Slide controls">
            <button type="button" disabled={index === 0} onClick={() => setIndex(value => value - 1)}>Previous</button>
            <span aria-live="polite">{index + 1} / {deck.slides.length}</span>
            <button type="button" disabled={index === last} onClick={() => setIndex(value => value + 1)}>Next</button>
            <button type="button" onClick={fullscreen}>Full screen</button>
        </nav>
        {message && <p className={styles.message} role="status">{message}</p>}
    </main>
}
