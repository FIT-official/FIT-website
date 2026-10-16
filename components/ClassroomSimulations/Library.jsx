'use client'

import { useState } from 'react'
import Link from 'next/link'
import { activities, filterActivities } from '@/public/simulations/catalog'
import styles from './library.module.css'

export function ActivityArt({ id, accent }) {
  return <svg viewBox="0 0 480 230" role="img" aria-label={{ sampling: 'A wave and its sensor samples', feedback: 'A temperature response approaching a target', 'base-rates': 'Inspection counts in a batch', 'heat-path': 'A patterned heat-conduction plate' }[id]}>
    <rect width="480" height="230" fill={id === 'base-rates' ? '#edf7f1' : id === 'feedback' ? '#fbf1e7' : id === 'heat-path' ? '#f9eeee' : '#eff1fc'} />
    <g stroke={accent} opacity=".1">{[60, 110, 160, 210].map(y => <path key={y} d={`M30 ${y}H450`} />)}{[50, 110, 170, 230, 290, 350, 410].map(x => <path key={x} d={`M${x} 20V210`} />)}</g>
    {id === 'sampling' && <><path d="M25 120C50 10 75 10 100 120S150 230 175 120S225 10 250 120S300 230 325 120S375 10 400 120S450 230 475 120" fill="none" stroke={accent} strokeWidth="3" />{[25, 70, 115, 160, 205, 250, 295, 340, 385, 430, 475].map((x, i) => <circle key={x} cx={x} cy={120 + 74 * Math.sin(i * 1.13)} r="5" fill="#192c34" />)}<path d="M25 120Q145 12 250 120T475 120" fill="none" stroke="#b86b32" strokeWidth="2.5" strokeDasharray="7 5" /></>}
    {id === 'feedback' && <><path d="M35 80H445" stroke="#7e9690" strokeWidth="2" strokeDasharray="6 5" /><path d="M35 200C60 180 80 90 115 52S165 110 200 88S260 76 300 81S400 80 445 80" fill="none" stroke={accent} strokeWidth="3.5" /><path d="M35 200C80 188 80 100 132 65S186 118 220 97S290 82 445 80" fill="none" stroke="#5867ce" strokeWidth="2" strokeDasharray="6 5" /><text x="342" y="64" fontSize="12" fill="#536b66">TARGET</text></>}
    {id === 'base-rates' && <>{Array.from({ length: 80 }, (_, i) => <rect key={i} x={48 + i % 16 * 25} y={43 + Math.floor(i / 16) * 30} width="14" height="18" rx="3" fill={i < 8 ? accent : i < 27 ? '#cd8a52' : '#bed1c7'} />)}<text x="48" y="218" fontSize="12" fill="#4a655f">TRUE FLAGS</text><text x="192" y="218" fontSize="12" fill="#7a5a3b">FALSE ALARMS</text></>}
    {id === 'heat-path' && <>{Array.from({ length: 112 }, (_, i) => <rect key={i} x={40 + i % 14 * 29} y={20 + Math.floor(i / 14) * 24} width="27" height="22" rx="2" fill={i % 14 === 0 ? '#bf4548' : Math.floor(i / 14) === 4 && i % 14 < 11 ? '#db9472' : i % 14 === 7 && Math.floor(i / 14) < 4 ? '#344a52' : '#cfdfe5'} />)}<circle cx="344" cy="129" r="13" fill="white" stroke="#283e46" strokeWidth="2" /><text x="339" y="134" fontSize="13" fill="#283e46">A</text></>}
  </svg>
}

export default function Library() {
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState('All')
  const [level, setLevel] = useState('All')
  const results = filterActivities({ query, subject, level })
  const clear = () => { setQuery(''); setSubject('All'); setLevel('All') }
  return <main className={styles.library}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><span>Classes</span><span aria-hidden="true">/</span><span>Simulation library</span></nav>
    <header className={styles.hero}>
      <div><p className={styles.eyebrow}>FIT LEARNING STUDIO</p><h1>Small experiments.<br />Big <em>what ifs.</em></h1><p className={styles.lead}>A hands-on collection for curious minds. Change a variable, test a prediction, and see the maths behind the result.</p><div className={styles.heroMeta}><span>4 original activities</span><span>No account needed</span><span>Browser playable</span></div></div>
      <div className={styles.heroDrawing} aria-hidden="true"><svg viewBox="0 0 340 270"><path d="M20 160H320M170 20V250" stroke="#b5c9bd" strokeWidth="1" /><circle cx="170" cy="138" r="96" fill="none" stroke="#b5c9bd" strokeDasharray="4 5" /><path d="M25 165C60 165 55 45 110 55S115 220 175 205S230 55 280 80S295 165 325 165" fill="none" stroke="#254f42" strokeWidth="3" /><circle cx="110" cy="55" r="8" fill="#d9a65a" /><circle cx="175" cy="205" r="8" fill="#d9a65a" /><circle cx="280" cy="80" r="8" fill="#d9a65a" /><text x="20" y="35" fill="#536b62" fontSize="13">PREDICT → TEST → EXPLAIN</text><text x="232" y="246" fill="#536b62" fontSize="16">y = f(x)</text></svg><span className={styles.sketchNote}>Follow your question.</span></div>
    </header>
    <section className={styles.catalog} aria-labelledby="catalog-heading">
      <div className={styles.sectionTop}><div><p className={styles.eyebrow}>MAKE AN OBSERVATION</p><h2 id="catalog-heading">Choose your experiment</h2></div><p>Maths, physics and engineering<br />for independent or guided exploration.</p></div>
      <div className={styles.filters}><div className={styles.search}><label htmlFor="simulation-search">Search activities</label><input id="simulation-search" type="search" placeholder="Try waves, probability, heat…" value={query} onChange={e => setQuery(e.target.value)} /></div><div className={styles.level}><label htmlFor="simulation-level">Difficulty</label><select id="simulation-level" value={level} onChange={e => setLevel(e.target.value)}>{['All', 'Introductory', 'Intermediate', 'Advanced'].map(x => <option key={x} value={x}>{x === 'All' ? 'All levels' : x}</option>)}</select></div></div>
      <div className={styles.subjects} role="group" aria-label="Filter by subject">{['All', 'Math', 'Physics', 'Engineering', 'Computing', 'Statistics'].map(x => <button key={x} aria-pressed={subject === x} onClick={() => setSubject(x)}>{x === 'All' ? 'All subjects' : x}</button>)}</div>
      <div className={styles.resultTop}><p aria-live="polite">{results.length} {results.length === 1 ? 'activity' : 'activities'}</p>{(query || subject !== 'All' || level !== 'All') && <button onClick={clear}>Clear filters</button>}</div>
      <div className={styles.grid}>{results.map(activity => <article className={styles.card} key={activity.id}>
        <Link href={`/classes/simulations/${activity.id}`} className={styles.artLink} tabIndex={-1} aria-hidden="true"><ActivityArt id={activity.id} accent={activity.accent} /></Link>
        <div className={styles.cardBody}><span className={styles.category}>{activity.category}</span><div className={styles.cardMeta}><span>{activity.level}</span><span>{activity.minutes} min</span></div><h3><Link href={`/classes/simulations/${activity.id}`}>{activity.title}</Link></h3><p>{activity.description}</p><div className={styles.cardFoot}><span>{activity.subjects.join(' · ')}</span><Link href={`/classes/simulations/${activity.id}`} aria-label={`Launch ${activity.title}`}>Explore <span aria-hidden="true">↗</span></Link></div></div>
      </article>)}</div>
      {results.length === 0 && <div className={styles.empty}><h3>No experiments match yet.</h3><p>Try a broader topic or clear your filters to see all four activities.</p><button onClick={clear}>Show all activities</button></div>}
    </section>
    <section className={styles.teacherStrip}><div><p className={styles.eyebrow}>FOR THE CLASSROOM</p><h2>Begin with a prediction.</h2><p>Every activity includes a question to investigate, teacher prompts, the governing equations, and clear model limits. Use the full-page link or the compact same-origin player in FIT lessons.</p></div><div className={styles.process}><span>01 <b>Predict</b></span><span>02 <b>Explore</b></span><span>03 <b>Explain</b></span></div></section>
    <section className={styles.resources} aria-labelledby="resources-heading"><h2 id="resources-heading">Keep exploring</h2><p>Different tools serve different questions. These established resources complement FIT’s original activities. External sites have their own terms and data practices.</p><div className={styles.peerGrid}>
      {[
        ['PhET', 'Conceptual science and maths exploration', 'https://phet.colorado.edu/'],
        ['Desmos', 'Expression-driven graphing and sliders', 'https://www.desmos.com/calculator'],
        ['GeoGebra', 'Dynamic geometry, algebra and 3D', 'https://www.geogebra.org/'],
        ['Falstad', 'Circuits and advanced visual models', 'https://www.falstad.com/mathphysics.html'],
        ['myPhysicsLab', 'Mechanics, graphs and model derivations', 'https://www.myphysicslab.com/'],
        ['Concord Consortium', 'Molecular and environmental models', 'https://concord.org/'],
      ].map(([name, text, href]) => <a key={name} href={href} target="_blank" rel="noopener noreferrer"><strong>{name} ↗</strong><span>{text}</span></a>)}
    </div><p className={styles.small}>FIT’s code, activities and diagrams are independently authored. Resource links do not imply affiliation or endorsement. Suggested ages are starting points; classroom learning outcomes have not yet been evaluated.</p></section>
  </main>
}

export { activities }
