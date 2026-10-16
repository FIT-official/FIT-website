'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getLiveSims } from '@/lib/sims/registry'
import { GALLERY_LEVELS, GALLERY_TOPICS, GALLERY_DIFFICULTIES, GALLERY_ART, EMPTY_FILTERS, filterGallery, parseGalleryQuery, galleryQuery, simLevels, topicKey, difficultyKey } from '@/lib/sims/gallery'
import AddToClass from '@/components/sims/AddToClass'
import ActivityArt from '@/components/sims/ActivityArt'
import styles from './gallery.module.css'

const activities = getLiveSims()
const present = key => activities.some(sim => topicKey(sim) === key)
const topics = GALLERY_TOPICS.filter(topic => present(topic.key))
// Badge colour overrides (Minister): Feedback's badge matches its teal art background.
const BADGE_OVERRIDE = { feedback: { background: '#2EC4A6', color: '#111111' } }

const Star = ({ on = true, size = 15 }) => <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={on ? styles.starOn : styles.starOff}><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>
const Check = () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
const TOPIC_ICON = {
  ratio: <g fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="7" cy="13" r="4"/><circle cx="16.5" cy="11" r="5.5"/></g>,
  fractions: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 12V3a9 9 0 0 1 9 9Z" fill="currentColor"/></g>,
  probability: <><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="2.2"/><g fill="currentColor"><circle cx="8.5" cy="8.5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="15.5" cy="15.5" r="1.6"/></g></>,
  heat: <path d="M12 2.5c.8 3.2 5 5.4 5 10.7a5 5 0 0 1-10 0c0-2.6 1.6-3.8 2.2-5.7.9 1 1.3 2 1.3 3.2 1.1-2.1 1.7-4.7 1.5-8.2Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/>,
  waves: <path d="M2 12c2-5 4.5-5 6.5 0s4.5 5 6.5 0 4.5-5 6.5 0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>,
  control: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/><circle cx="12" cy="16" r="1.6" fill="currentColor"/></g>,
  differentiation: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 19c4-1 7-6 9-11 1-2.5 3-4 6-4"/><path d="M5 15.5 19 5.5"/><circle cx="11" cy="10" r="1.8" fill="currentColor"/></g>,
  forces: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="9" width="8" height="8" rx="1.5"/><path d="M12 13h8M17 10l3 3-3 3"/></g>,
  'linear-graphs': <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 3v17h17"/><path d="M6 17 19 6"/></g>,
  circuits: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8V5h16v14H4v-3"/><path d="M2 10h4M3.5 13h1"/><circle cx="20" cy="12" r="2.6" fill="currentColor"/></g>,
}

function Tile({ sim, hidden, addToClassEnabled }) {
  const levels = simLevels(sim)
  const stars = GALLERY_DIFFICULTIES.find(d => d.key === difficultyKey(sim))?.stars ?? 2
  const art = GALLERY_ART[sim.id]
  return <li className={styles.item} hidden={hidden} data-level={levels.join(' ')} data-topic={topicKey(sim)} data-difficulty={difficultyKey(sim)}>
    <Link href={`/class/simulations/${sim.id}`} className={styles.tile}>
      <span className={styles.art}>{art
        ? <img src={`/simulations/art/${art}.svg`} alt="" width="400" height="300" loading="lazy" decoding="async"/>
        : <ActivityArt id={sim.id} accent={sim.accent} concept={sim.concept} level={sim.level} badge={false}/>}</span>
      <span className={styles.body}>
        <h3>{sim.title}</h3>
        <span className={styles.meta}>
          <ul className={styles.badges}>{levels.map(key => { const level = GALLERY_LEVELS.find(l => l.key === key); return <li key={key} data-level={key} className={styles.badge} style={BADGE_OVERRIDE[sim.id]}>{level.label}</li> })}</ul>
          <span className={styles.stars} role="img" aria-label={`Difficulty: ${GALLERY_DIFFICULTIES[stars - 1].label}`}>{[1, 2, 3].map(n => <Star key={n} on={n <= stars} size={18}/>)}</span>
        </span>
      </span>
    </Link>
    {addToClassEnabled === true && <div className={styles.classAction}><AddToClass simId={sim.id}/></div>}
  </li>
}

export default function Library({ addToClassEnabled = false }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  useEffect(() => { setFilters(parseGalleryQuery(window.location.search)) }, [])
  const update = next => {
    setFilters(next)
    const url = `${window.location.pathname}${galleryQuery(next)}${window.location.hash}`
    window.history.replaceState(window.history.state, '', url)
  }
  const toggle = (row, key) => update({ ...filters, [row]: filters[row].includes(key) ? filters[row].filter(k => k !== key) : [...filters[row], key] })
  const clear = () => update(EMPTY_FILTERS)
  const results = useMemo(() => new Set(filterGallery(activities, filters).map(sim => sim.id)), [filters])
  const chip = (row, key, label, glyph, extra = {}) => <button type="button" key={key} className={styles.chip} data-row={row} aria-pressed={filters[row].includes(key)} onClick={() => toggle(row, key)} onFocus={event => event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })} {...extra}>{glyph}<span>{label}</span></button>
  return <main className={styles.gallery}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><Link href="/class">Class</Link><span aria-hidden="true">/</span><span aria-current="page">Simulations</span></nav>
    <header className={styles.hero}>
      <h1>Simulations</h1>
      <svg className={styles.shapes} viewBox="0 0 280 140" aria-hidden="true"><path d="M8 34c14-16 28-16 42 0s28 16 42 0" fill="none" stroke="#6A45F5" strokeWidth="7" strokeLinecap="round"/><circle cx="52" cy="92" r="36" fill="#FFC83D" stroke="#111" strokeWidth="5"/><path d="M128 124 160 58l32 66Z" fill="#FF6B3D" stroke="#111" strokeWidth="5" strokeLinejoin="round"/><rect x="204" y="62" width="58" height="58" rx="14" transform="rotate(12 233 91)" fill="#2EC4A6" stroke="#111" strokeWidth="5"/><circle cx="150" cy="24" r="9" fill="#FF9EC0" stroke="#111" strokeWidth="4"/><circle cx="248" cy="18" r="11" fill="#1F66E5" stroke="#111" strokeWidth="4"/></svg>
    </header>
    <section className={styles.panel} aria-label="Filters">
      <div className={styles.row} role="group" aria-labelledby="filter-level"><h2 id="filter-level">Level</h2><div className={styles.chips}>{GALLERY_LEVELS.map(level => chip('level', level.key, level.label, filters.level.includes(level.key) ? <Check/> : <span className={styles.dot} aria-hidden="true"/>, { 'data-level': level.key }))}</div></div>
      <div className={styles.row} role="group" aria-labelledby="filter-topic"><h2 id="filter-topic">Topic</h2><div className={styles.chips}>{topics.map(topic => chip('topic', topic.key, topic.label, <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>{TOPIC_ICON[topic.key]}</svg>))}</div></div>
      <div className={styles.row} role="group" aria-labelledby="filter-difficulty"><h2 id="filter-difficulty">Difficulty</h2><div className={styles.chips}>{GALLERY_DIFFICULTIES.map(d => chip('difficulty', d.key, d.label, <span className={styles.chipStars} aria-hidden="true">{Array.from({ length: d.stars }, (_, i) => <Star key={i}/>)}</span>))}<button type="button" className={styles.clear} onClick={clear}>Clear</button></div></div>
    </section>
    <p className={styles.srOnly} aria-live="polite">{results.size} {results.size === 1 ? 'simulation' : 'simulations'}</p>
    <ul className={styles.grid}>{activities.map(sim => <Tile key={sim.id} sim={sim} hidden={!results.has(sim.id)} addToClassEnabled={addToClassEnabled}/>)}</ul>
    {results.size === 0 && <div className={styles.empty}><svg viewBox="0 0 120 90" aria-hidden="true"><circle cx="50" cy="42" r="26" fill="#FFF4D6" stroke="#111" strokeWidth="5"/><path d="M69 61l22 20" stroke="#111" strokeWidth="7" strokeLinecap="round"/></svg><button type="button" className={styles.clear} onClick={clear}>Clear</button></div>}
    <footer className={styles.footer}>Original FIT simulations.</footer>
  </main>
}

export { activities, ActivityArt }
