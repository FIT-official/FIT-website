'use client'

import { useState } from 'react'
import Link from 'next/link'
import { filterSimulations, getLiveSims, getSimulationFilterOptions } from '@/lib/sims/registry'
import AddToClass from '@/components/sims/AddToClass'
import ActivityArt from '@/components/sims/ActivityArt'
import styles from './library.module.css'

const activities = getLiveSims()
const filterOptions = getSimulationFilterOptions()

export default function Library() {
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState('All')
  const [level, setLevel] = useState('All')
  const [topic, setTopic] = useState('All')
  const results = filterSimulations({ query, subject, level, topic })
  const clear = () => { setQuery(''); setSubject('All'); setLevel('All'); setTopic('All') }
  return <main className={styles.library}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span>Simulation library</span></nav>
    <header className={styles.hero}>
      <div><p className={styles.eyebrow}>FIT LEARNING STUDIO</p><h1>Small experiments.<br />Big <em>what ifs.</em></h1><p className={styles.lead}>Change a variable. Test a prediction. Discover the maths behind the result, one experiment at a time.</p><div className={styles.heroMeta}><span>{activities.length} original activities</span><span>Free to explore</span><span>Progress on your device</span></div><a className={styles.heroCta} href="#catalog-heading">Find an experiment <span aria-hidden="true">↓</span></a></div>
      <div className={styles.heroDrawing} aria-hidden="true"><svg viewBox="0 0 340 270"><defs><linearGradient id="hero-paper" x2="1" y2="1"><stop stopColor="#fff7e1"/><stop offset="1" stopColor="#f9e6c0"/></linearGradient></defs><rect x="0" y="0" width="340" height="270" rx="16" fill="url(#hero-paper)"/><path d="M20 160H320M170 20V250" stroke="#d8cbb3"/><circle cx="170" cy="138" r="96" fill="none" stroke="#d8cbb3" strokeDasharray="4 5"/><path d="M25 165C60 165 55 45 110 55S115 220 175 205S230 55 280 80S295 165 325 165" fill="none" stroke="#292c33" strokeWidth="3"/>{[[110,55],[175,205],[280,80]].map(([x,y]) => <g key={x}><circle cx={x} cy={y} r="15" fill="#f59e0b" opacity=".15"/><circle cx={x} cy={y} r="7" fill="#c97913" stroke="#fff" strokeWidth="3"/></g>)}<text x="20" y="35" fill="#76613e" fontSize="11" letterSpacing="1">PREDICT → TEST → EXPLAIN</text><text x="232" y="246" fill="#76613e" fontSize="16">y = f(x)</text></svg><span className={styles.sketchNote}>Follow your question.</span></div>
    </header>
    <section className={styles.catalog} aria-labelledby="catalog-heading">
      <div className={styles.sectionTop}><div><p className={styles.eyebrow}>MAKE AN OBSERVATION</p><h2 id="catalog-heading">Choose your experiment</h2></div><p>Explore independently.<br />Bring a question to class.</p></div>
      <div className={styles.filters}>
        <div className={styles.search}><label htmlFor="simulation-search">Search activities</label><div className={styles.searchField}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input id="simulation-search" type="search" placeholder="Try waves, probability, heat…" value={query} onChange={event => setQuery(event.target.value)} /></div></div>
        <div className={styles.selectField}><label htmlFor="simulation-level">Learning level</label><select id="simulation-level" value={level} onChange={event => setLevel(event.target.value)}><option value="All">All levels</option>{filterOptions.levels.map(value => <option key={value}>{value}</option>)}</select></div>
        <div className={styles.selectField}><label htmlFor="simulation-topic">Topic</label><select id="simulation-topic" value={topic} onChange={event => setTopic(event.target.value)}><option value="All">All topics</option>{filterOptions.topics.map(value => <option key={value}>{value}</option>)}</select></div>
      </div>
      <div className={styles.subjects} role="group" aria-label="Filter by subject">{['All', ...filterOptions.subjects].map(value => <button type="button" key={value} aria-pressed={subject === value} onClick={() => setSubject(value)}>{value === 'All' ? 'All subjects' : value}</button>)}</div>
      <div className={styles.resultTop}><p aria-live="polite">{results.length} {results.length === 1 ? 'activity' : 'activities'}</p>{(query || subject !== 'All' || level !== 'All' || topic !== 'All') && <button type="button" onClick={clear}>Clear filters</button>}</div>
      <div className={styles.grid}>{results.map(activity => <article className={styles.card} key={activity.id}>
        <Link href={`/classes/simulations/${activity.id}`} className={styles.artLink} tabIndex={-1} aria-hidden="true"><ActivityArt id={activity.id} accent={activity.accent}/></Link>
        <div className={styles.cardBody}><span className={styles.category}>{activity.subject}</span><div className={styles.cardMeta}><span className={styles.levelTag}>{activity.level}</span><span>{activity.minutes} min</span></div><h3><Link href={`/classes/simulations/${activity.id}`}>{activity.title}</Link></h3><p>{activity.approach}</p><div className={styles.cardFoot}><span>{activity.topic}</span><Link href={`/classes/simulations/${activity.id}`} aria-label={`Launch ${activity.title}`}>Explore <span aria-hidden="true">↗</span></Link></div><div className={styles.addToClass}><AddToClass simId={activity.id}/></div></div>
      </article>)}</div>
      {results.length === 0 && <div className={styles.empty}><span aria-hidden="true">⌕</span><h3>No experiments match yet.</h3><p>Try another topic or clear the filters to explore the collection.</p><button type="button" onClick={clear}>Show all activities</button></div>}
    </section>
    <section className={styles.teacherStrip}><div><p className={styles.eyebrow}>FOR THE CLASSROOM</p><h2>Begin with a prediction.</h2><p>Each activity brings together a question, an interactive model and the ideas behind it. Add an experiment to your class, then compare observations and explain what changed.</p><p className={styles.small}>Levels are starting points for lesson planning. Syllabus references are awaiting curriculum review.</p></div><div className={styles.process}><span>01 <b>Predict</b></span><span>02 <b>Explore</b></span><span>03 <b>Explain</b></span></div></section>
    <footer className={styles.libraryFooter}>Original FIT activities. Models simplify real systems; read the assumptions in each experiment.</footer>
  </main>
}

export { activities, ActivityArt }
