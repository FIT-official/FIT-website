'use client'

import Image from 'next/image'
import { useEffect, useId, useRef, useState } from 'react'
import styles from './ProjectGallery.module.css'

const PREVIEW_COUNT = 8

export default function ProjectGallery({ photos, title, intro }) {
    const [album, setAlbum] = useState('All photos')
    const [expanded, setExpanded] = useState(false)
    const [active, setActive] = useState(null)
    const dialog = useRef(null)
    const opener = useRef(null)
    const id = useId()
    const filtered = album === 'All photos' ? photos : photos.filter(photo => photo.album === album)
    const visible = expanded ? filtered : filtered.slice(0, PREVIEW_COUNT)
    const photo = active === null ? null : filtered[active]
    const isOpen = active !== null

    useEffect(() => {
        if (!isOpen) return
        const modal = dialog.current
        const trigger = opener.current
        const previousOverflow = document.body.style.overflow
        modal.showModal()
        document.body.style.overflow = 'hidden'
        return () => {
            modal.close()
            document.body.style.overflow = previousOverflow
            trigger?.focus()
        }
    }, [isOpen])

    function move(direction) {
        setActive(index => (index + direction + filtered.length) % filtered.length)
    }

    return <section className={styles.gallery} aria-labelledby={`${id}-title`} id="gallery">
        <div className={styles.heading}>
            <div><p className={styles.eyebrow}>In pictures</p><h2 id={`${id}-title`}>{title}</h2></div>
            <p>{intro}</p>
        </div>
        <div className={styles.toolbar}>
            <div className={styles.filters} role="group" aria-label="Photo albums">
                {['All photos', ...new Set(photos.map(item => item.album))].map(name => <button type="button" key={name}
                    aria-pressed={album === name} onClick={() => { setAlbum(name); setExpanded(false) }}>{name}</button>)}
            </div>
            <p className={styles.count} aria-live="polite">{filtered.length} photos · Select to enlarge</p>
        </div>
        <div className={styles.grid} id={`${id}-photos`}>
            {visible.map((item, index) => <figure className={styles.card} key={item.src}>
                <a href={item.src} aria-label={`Enlarge: ${item.caption}`} aria-haspopup="dialog" onClick={event => {
                    event.preventDefault(); opener.current = event.currentTarget; setActive(index)
                }}>
                    <Image src={item.src} alt={item.alt} width={item.width} height={item.height}
                        sizes={index < 2 ? '(max-width: 767px) 90vw, 45vw' : '(max-width: 767px) 45vw, 30vw'} />
                    <span className={styles.enlarge} aria-hidden="true">↗</span>
                </a>
                <figcaption><span>{item.album}</span>{item.caption}</figcaption>
            </figure>)}
        </div>
        {filtered.length > PREVIEW_COUNT && <div className={styles.more}>
            <button type="button" aria-expanded={expanded} aria-controls={`${id}-photos`} onClick={() => setExpanded(value => !value)}>
                {expanded ? 'Show fewer photos' : `View all ${filtered.length} photos`} <span aria-hidden="true">{expanded ? '−' : '+'}</span>
            </button>
        </div>}
        <dialog ref={dialog} className={styles.lightbox} aria-label="Project photos" aria-describedby={`${id}-caption`}
            data-lenis-prevent onCancel={event => { event.preventDefault(); setActive(null) }}
            onClick={event => { if (event.target === event.currentTarget) setActive(null) }}
            onKeyDown={event => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                    event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1)
                }
            }}>
            {photo && <div className={styles.viewer}>
                <div className={styles.viewerHeader}><span>{photo.album}</span><button type="button" onClick={() => setActive(null)} aria-label="Close photo viewer">Close <span aria-hidden="true">×</span></button></div>
                <div className={styles.fullPhoto}><Image key={photo.src} src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} sizes="(max-width: 767px) 100vw, 90vw" /></div>
                <div className={styles.viewerFooter}>
                    <p id={`${id}-caption`} aria-live="polite">{photo.caption}</p>
                    <div className={styles.controls}><button type="button" aria-label="Previous photo" onClick={() => move(-1)}>←</button><span aria-live="polite">{active + 1} / {filtered.length}</span><button type="button" aria-label="Next photo" onClick={() => move(1)}>→</button></div>
                </div>
            </div>}
        </dialog>
    </section>
}
