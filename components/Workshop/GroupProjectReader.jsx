'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import PupilIdeaCopy from './PupilIdeaCopy'
import styles from './GroupProjectReader.module.css'

export default function GroupProjectReader({ groups }) {
    const [index, setIndex] = useState(0), viewport = useRef(null)
    const group = groups[index], last = groups.length - 1
    useEffect(() => { if (viewport.current) viewport.current.scrollTop = 0 }, [index])
    useEffect(() => {
        function key(event) {
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target?.isContentEditable || event.target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return
            if (event.key === 'ArrowRight') { event.preventDefault(); setIndex(value => Math.min(last, value + 1)) }
            if (event.key === 'ArrowLeft') { event.preventDefault(); setIndex(value => Math.max(0, value - 1)) }
        }
        window.addEventListener('keydown', key)
        return () => window.removeEventListener('keydown', key)
    }, [last])
    return <main className={styles.root} aria-label="Group project reader">
        <header className={styles.toolbar}>
            <div><h1 className="text-xl font-semibold">Group projects</h1><p className="text-sm">Scroll down for both ideas. Use left and right arrows to change groups.</p></div>
            <nav className={styles.controls} aria-label="Group navigation">
                <button type="button" className="formWhiteButton" disabled={index === 0} onClick={() => setIndex(value => Math.max(0, value - 1))}>Previous group</button>
                <label className="text-sm">Group<select className="formInput block" value={index} onChange={event => setIndex(Number(event.target.value))}>{groups.map((item, position) => <option key={item.id} value={position}>Group {item.number}</option>)}</select></label>
                <button type="button" className="formWhiteButton" disabled={index === last} onClick={() => setIndex(value => Math.min(last, value + 1))}>Next group</button>
            </nav>
            <p className="text-sm" role="status">Group {group.number} of {groups.length}</p>
        </header>
        <div ref={viewport} className={styles.viewport} tabIndex={0} role="region" aria-label="Project details">
            <article className={styles.page} key={group.id}>
                <h2 className="text-3xl font-bold">Group {group.number}: two project ideas</h2>
                <p className="mt-3">These drawings explain ideas to discuss. The designs still need to be built and tested.</p>
                {group.ideas.map((idea, position) => <section key={idea.title} className={styles.idea} aria-labelledby={'project-' + group.id + '-' + position}>
                    <h3 className="text-2xl font-semibold" id={'project-' + group.id + '-' + position}>Idea {position + 1}: {idea.title}</h3>
                    <figure className="mt-5"><Image src={idea.image.src} alt={idea.image.alt} width={idea.image.width} height={idea.image.height} sizes="(max-width: 960px) 92vw, 900px" className="w-full h-auto rounded-lg" /><figcaption className="text-sm mt-2">{idea.image.caption}</figcaption></figure>
                    <h4 className="font-semibold mt-5">Key points</h4><ul className="list-disc pl-5 mt-2 space-y-2">{idea.copy.key_points.map(point => <li key={point}>{point}</li>)}</ul>
                    <PupilIdeaCopy copy={idea.copy} />
                </section>)}
            </article>
        </div>
    </main>
}
