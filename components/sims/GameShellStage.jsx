'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './GameShell.module.css'

export default function GameShellStage({ activity, source, title }) {
  const frame = useRef(null)
  const observer = useRef(null)
  const [height, setHeight] = useState(activity.height || 780)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => () => observer.current?.disconnect(), [])
  function onLoad() {
    setLoaded(true)
    observer.current?.disconnect()
    // Same-origin content can grow when learners open equations or teacher notes.
    // Observe body content rather than document height to allow shrinking again.
    try {
      const body = frame.current.contentDocument?.body
      if (!body) return
      const resize = () => setHeight(Math.max(420, Math.ceil(body.getBoundingClientRect().height) + 2))
      resize()
      if (typeof ResizeObserver !== 'undefined') {
        observer.current = new ResizeObserver(resize)
        observer.current.observe(body)
      }
    } catch { /* The fixed-height player remains usable if the host changes origin. */ }
  }
  return <div className={styles.stage} aria-busy={!loaded}>
    {!loaded && <p className={styles.loading} role="status">Opening the experiment…</p>}
    <iframe ref={frame} src={source || `/simulations/${encodeURIComponent(activity.id)}?embed=1`} title={title || `${activity.title} interactive ${activity.kind === 'game' ? 'game' : 'experiment'}`} onLoad={onLoad} style={{ height }} className={styles.frame} loading="lazy" allow="fullscreen" />
  </div>
}
