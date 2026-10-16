import { useId } from 'react'
import { CONCEPT_TILE_SVG } from './conceptTiles'

const labels = { sampling: 'A wave and its sensor samples', feedback: 'A temperature response approaching a target', 'base-rates': 'Inspection counts in a batch', 'heat-path': 'A patterned heat-conduction plate', 'ratio-sweets-share': 'Three colourful sweet jars showing a one-to-two-to-three ratio', 'ratio-paint-mix': 'Two measured paint colours blend into a matching purple swatch', 'fractions-pizza-party': 'An eight-slice pizza with three slices marked and the fraction three eighths', 'fractions-number-line-jump': 'A friendly frog at one half on a number line from zero to one' }

const gamePaper = { 'ratio-sweets-share': '#fff3e8', 'ratio-paint-mix': '#fff0f1', 'fractions-pizza-party': '#fff2df', 'fractions-number-line-jump': '#e8f7ef' }

// Original vector illustrations. No image downloads or third-party artwork.
// FIT Publicity concept tiles: one per concept, shared by every level variant, recoloured at render
// time by level (DESIGN_SPEC level colours) through CSS variables. No per-level art files.
export const LEVEL_COLOURS = {
  Primary: { c: '#FFC83D', tint: '#FFF4D6', on: '#111111' },
  Secondary: { c: '#2EC4A6', tint: '#DDF7F1', on: '#111111' },
  JC: { c: '#6A45F5', tint: '#ECE7FF', on: '#FFFFFF' },
  Poly: { c: '#FF6B3D', tint: '#FFE6DC', on: '#111111' },
  University: { c: '#1F66E5', tint: '#E2ECFD', on: '#FFFFFF' },
}
export const CONCEPT_TILES = Object.keys(CONCEPT_TILE_SVG)
// Where a level colour collides with the art's own colours, shift the level-coloured parts darker
// (ratio: the pot vs the mint tub at Secondary, vs the blue pots at University).
export const TILE_SHIFT = { ratio: { Secondary: 55, University: 55 } }
export function tileColour(concept, level) {
  const lv = LEVEL_COLOURS[level]
  if (!lv) return '#FFDD00'
  const shift = TILE_SHIFT[concept]?.[level]
  return shift ? `color-mix(in srgb, ${lv.c} ${shift}%, #111111)` : lv.c
}
export default function ActivityArt({ id, accent, concept, level }) {
  const gradient = useId().replaceAll(':', '')
  if (concept && CONCEPT_TILE_SVG[concept]) {
    const lv = LEVEL_COLOURS[level] || { c: '#FFDD00', tint: '#FEFEFE', on: '#111111' }
    const c = tileColour(concept, level)
    const vars = { '--c': c, '--c-dark': `color-mix(in srgb, ${c} 78%, #111111)`, '--tint': lv.tint, '--on': lv.on }
    return <span className="fit-tile" data-level={level} style={{ ...vars, position: 'relative', display: 'block', background: lv.tint, aspectRatio: '4 / 3', overflow: 'hidden' }}>
      <span style={{ display: 'block', width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: CONCEPT_TILE_SVG[concept].replace(' role="img"', ' aria-hidden="true" focusable="false" width="100%" height="100%"') }}/>
      {level && <span className="fit-tile-badge" style={{ position: 'absolute', top: 10, left: 10, background: lv.c, color: lv.on, border: '2px solid #111111', font: '800 12px/1 Inter, system-ui, sans-serif', letterSpacing: '.04em', textTransform: 'uppercase', padding: '5px 9px', borderRadius: 999 }}>{level}</span>}
    </span>
  }
  const paper = gamePaper[id] || (id === 'base-rates' ? '#edf7f1' : id === 'feedback' ? '#fff1e3' : id === 'heat-path' ? '#fbeef0' : '#eff1fc')
  return <svg viewBox="0 0 480 230" role="img" aria-label={labels[id]}>
    <defs><linearGradient id={gradient} x2="1" y2="1"><stop stopColor={paper}/><stop offset="1" stopColor="#ffffff"/></linearGradient></defs>
    <rect width="480" height="230" fill={`url(#${gradient})`}/><circle cx="428" cy="25" r="90" fill={accent} opacity=".04"/>
    <g stroke={accent} opacity=".1">{[60,110,160,210].map(y => <path key={y} d={`M30 ${y}H450`}/>)}{[50,110,170,230,290,350,410].map(x => <path key={x} d={`M${x} 20V210`}/>)}</g>
    {id === 'sampling' && <><path d="M25 120C50 10 75 10 100 120S150 230 175 120S225 10 250 120S300 230 325 120S375 10 400 120S450 230 475 120" fill="none" stroke={accent} strokeWidth="3"/>{[25,70,115,160,205,250,295,340,385,430,475].map((x,i) => <circle key={x} cx={x} cy={120 + 74 * Math.sin(i * 1.13)} r="5" fill="#192c34" stroke="white" strokeWidth="2"/>)}<path d="M25 120Q145 12 250 120T475 120" fill="none" stroke="#b86b32" strokeWidth="2.5" strokeDasharray="7 5"/></>}
    {id === 'feedback' && <><path d="M35 80H445" stroke="#7e9690" strokeWidth="2" strokeDasharray="6 5"/><path d="M35 200C60 180 80 90 115 52S165 110 200 88S260 76 300 81S400 80 445 80" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round"/><path d="M35 200C80 188 80 100 132 65S186 118 220 97S290 82 445 80" fill="none" stroke="#5867ce" strokeWidth="2" strokeDasharray="6 5"/><circle cx="115" cy="52" r="6" fill={accent} stroke="white" strokeWidth="3"/><text x="342" y="64" fontSize="12" fill="#536b66">TARGET</text></>}
    {id === 'base-rates' && <>{Array.from({length:80},(_,i) => <rect key={i} x={48 + i % 16 * 25} y={43 + Math.floor(i / 16) * 30} width="14" height="18" rx="4" fill={i < 8 ? accent : i < 27 ? '#cd8a52' : '#bed1c7'}/>)}<text x="48" y="218" fontSize="12" fill="#4a655f">TRUE FLAGS</text><text x="192" y="218" fontSize="12" fill="#7a5a3b">FALSE ALARMS</text></>}
    {id === 'heat-path' && <>{Array.from({length:112},(_,i) => <rect key={i} x={40 + i % 14 * 29} y={20 + Math.floor(i / 14) * 24} width="27" height="22" rx="4" fill={i % 14 === 0 ? '#bf4548' : Math.floor(i / 14) === 4 && i % 14 < 11 ? '#db9472' : i % 14 === 7 && Math.floor(i / 14) < 4 ? '#344a52' : '#cfdfe5'}/>)}<circle cx="344" cy="129" r="13" fill="white" stroke="#283e46" strokeWidth="2"/><text x="339" y="134" fontSize="13" fill="#283e46">A</text></>}
    {id === 'ratio-sweets-share' && <>
      <rect x="149" y="18" width="182" height="32" rx="16" fill="#fff" stroke="#e5d8ee"/>
      <text x="240" y="40" textAnchor="middle" fontSize="17" fontWeight="700" fill="#63508b">1 : 2 : 3</text>
      <rect x="40" y="192" width="400" height="11" rx="5" fill="#dbc5b5"/>
      {[{ x: 105, colour: '#e88aa6', count: 2 }, { x: 240, colour: '#7bade2', count: 4 }, { x: 375, colour: '#e7b85e', count: 6 }].map(({ x, colour, count }) => <g key={x}>
        <circle cx={x} cy="73" r="18" fill="#f6d3b6"/>
        <path d={`M${x - 18} 71a18 18 0 0 1 36 0c-12 -7 -20 -7 -36 0`} fill="#5b4054"/>
        <circle cx={x - 6} cy="75" r="1.8" fill="#3a3348"/><circle cx={x + 6} cy="75" r="1.8" fill="#3a3348"/>
        <path d={`M${x - 5} 81q5 5 10 0`} fill="none" stroke="#ab6c70" strokeWidth="1.8" strokeLinecap="round"/>
        <rect x={x - 45} y="105" width="90" height="88" rx="17" fill="#fff" fillOpacity=".85" stroke="#bfb5cd" strokeWidth="2"/>
        <rect x={x - 49} y="98" width="98" height="13" rx="6" fill={colour}/>
        <path d={`M${x - 34} 123v42`} stroke="#fff" strokeWidth="5" strokeLinecap="round"/>
        {Array.from({ length: count }, (_, index) => <g key={index} transform={`translate(${x - 19 + index % 2 * 38} ${174 - Math.floor(index / 2) * 24})`}>
          <path d="M-9 0l-7 -7v14ZM9 0l7 -7v14Z" fill={colour}/>
          <rect x="-10" y="-7" width="20" height="14" rx="6" fill={colour}/>
          <path d="M-4 -3h6" stroke="#fff" strokeOpacity=".7" strokeWidth="2" strokeLinecap="round"/>
        </g>)}
      </g>)}
    </>}
    {id === 'ratio-paint-mix' && <>
      <ellipse cx="256" cy="190" rx="177" ry="15" fill="#dacbdb" opacity=".45"/>
      <g transform="rotate(-7 102 128)">
        <rect x="62" y="68" width="79" height="113" rx="13" fill="#fff" stroke="#cfbfd7" strokeWidth="2"/>
        <rect x="68" y="113" width="67" height="62" rx="8" fill="#f45d88"/>
        <rect x="59" y="60" width="85" height="16" rx="5" fill="#635773"/>
        <rect x="76" y="125" width="50" height="33" rx="9" fill="#fff" fillOpacity=".9"/>
        <text x="101" y="148" textAnchor="middle" fontSize="20" fontWeight="700" fill="#574366">2</text>
      </g>
      <g transform="rotate(5 194 128)">
        <rect x="154" y="68" width="79" height="113" rx="13" fill="#fff" stroke="#cfbfd7" strokeWidth="2"/>
        <rect x="160" y="93" width="67" height="82" rx="8" fill="#4797ee"/>
        <rect x="151" y="60" width="85" height="16" rx="5" fill="#635773"/>
        <rect x="168" y="125" width="50" height="33" rx="9" fill="#fff" fillOpacity=".9"/>
        <text x="193" y="148" textAnchor="middle" fontSize="20" fontWeight="700" fill="#574366">3</text>
      </g>
      <path d="M256 119h30m-8 -8 9 8-9 8" stroke="#ab8cb9" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <g transform="rotate(7 363 122)">
        <rect x="306" y="39" width="115" height="156" rx="17" fill="#fff" stroke="#d4c7df" strokeWidth="2"/>
        <rect x="316" y="49" width="95" height="98" rx="10" fill="#8c80c5"/>
        <path d="M332 101q30 -38 63 -8m-66 28q29 -30 62 -15" fill="none" stroke="#ffffff" strokeOpacity=".26" strokeWidth="8" strokeLinecap="round"/>
        <text x="363" y="176" textAnchor="middle" fontSize="17" fontWeight="700" fill="#63508b">2 : 3</text>
      </g>
      <path d="M41 36c-15 17-10 26 0 26s15 -9 0 -26Z" fill="#eaa7ba"/>
      <circle cx="444" cy="178" r="7" fill="#abc6ed"/>
    </>}
    {id === 'fractions-pizza-party' && <>
      <ellipse cx="162" cy="185" rx="105" ry="22" fill="#dfc9b8"/>
      <circle cx="162" cy="117" r="94" fill="#fff" stroke="#e5d9ca" strokeWidth="3"/>
      <circle cx="162" cy="117" r="81" fill="#cf9455"/>
      <circle cx="162" cy="117" r="72" fill="#ffd078"/>
      <path d="M162 117V45a72 72 0 0 1 50.91 122.91Z" fill="#edb269"/>
      {Array.from({ length: 8 }, (_, index) => {
        const angle = index * Math.PI / 4 - Math.PI / 2
        const middle = angle + Math.PI / 8
        return <g key={index}>
          <path d={`M162 117L${162 + Math.cos(angle) * 72} ${117 + Math.sin(angle) * 72}`} stroke="#fff6dc" strokeWidth="3"/>
          <circle cx={162 + Math.cos(middle) * 49} cy={117 + Math.sin(middle) * 49} r="8" fill={index < 3 ? '#cd6b70' : '#dc7773'}/>
          <ellipse cx={162 + Math.cos(middle + .1) * 27} cy={117 + Math.sin(middle + .1) * 27} rx="6" ry="3" fill="#5a9a6b" transform={`rotate(${middle * 180 / Math.PI} ${162 + Math.cos(middle + .1) * 27} ${117 + Math.sin(middle + .1) * 27})`}/>
        </g>
      })}
      <path d="M169 37a81 81 0 0 1 55 143" fill="none" stroke="#825c9c" strokeWidth="5" strokeLinecap="round"/>
      <rect x="296" y="47" width="126" height="132" rx="22" fill="#fff" stroke="#e3d4e9" strokeWidth="2"/>
      <text x="359" y="93" textAnchor="middle" fontSize="35" fontWeight="750" fill="#775793">3</text>
      <path d="M334 107h50" stroke="#a58cb4" strokeWidth="3" strokeLinecap="round"/>
      <text x="359" y="145" textAnchor="middle" fontSize="35" fontWeight="750" fill="#775793">8</text>
      <text x="359" y="166" textAnchor="middle" fontSize="11" letterSpacing="1" fill="#8c719c">EQUAL SLICES</text>
      <path d="M304 198q53 13 110 -1" fill="none" stroke="#d7c1e2" strokeWidth="3" strokeLinecap="round"/>
    </>}
    {id === 'fractions-number-line-jump' && <>
      <path d="M0 176q120 -29 240 1t240 -1v54H0Z" fill="#c8e8dc"/>
      <g fill="none" stroke="#9fcfbe" strokeWidth="2"><ellipse cx="82" cy="211" rx="36" ry="5"/><ellipse cx="365" cy="211" rx="45" ry="5"/></g>
      <path d="M49 174H431" stroke="#82668f" strokeWidth="3" strokeLinecap="round"/>
      {Array.from({ length: 9 }, (_, index) => <path key={index} d={`M${50 + index * 47.5} 169v${index % 4 === 0 ? 17 : 11}`} stroke="#82668f" strokeWidth={index % 4 === 0 ? 3 : 2}/>)}
      <text x="50" y="205" textAnchor="middle" fontSize="16" fontWeight="650" fill="#665273">0</text>
      <text x="240" y="205" textAnchor="middle" fontSize="16" fontWeight="650" fill="#665273">1/2</text>
      <text x="430" y="205" textAnchor="middle" fontSize="16" fontWeight="650" fill="#665273">1</text>
      <path d="M67 144q42 -70 117 -22" fill="none" stroke="#ba9ed0" strokeWidth="3" strokeDasharray="5 7" strokeLinecap="round"/>
      <ellipse cx="240" cy="160" rx="53" ry="12" fill="#70b899"/>
      <path d="M240 157l29 6-26 -1Z" fill="#c8e8dc"/>
      <ellipse cx="211" cy="145" rx="25" ry="11" fill="#478f73" transform="rotate(-13 211 145)"/>
      <ellipse cx="269" cy="145" rx="25" ry="11" fill="#478f73" transform="rotate(13 269 145)"/>
      <ellipse cx="240" cy="121" rx="38" ry="31" fill="#7ed3a7"/>
      {[220,260].map(x => <g key={x}><circle cx={x} cy="94" r="16" fill="#7ed3a7"/><circle cx={x} cy="92" r="11" fill="#fff"/><circle cx={x + 2} cy="93" r="5" fill="#394652"/><circle cx={x + 4} cy="91" r="1.5" fill="#fff"/></g>)}
      <ellipse cx="212" cy="122" rx="6" ry="4" fill="#e69ca2"/><ellipse cx="268" cy="122" rx="6" ry="4" fill="#e69ca2"/>
      <path d="M228 123q12 12 24 0" fill="none" stroke="#3b7962" strokeWidth="2.5" strokeLinecap="round"/>
      <rect x="320" y="29" width="101" height="35" rx="17" fill="#fff" stroke="#cce5d7"/>
      <text x="370" y="52" textAnchor="middle" fontSize="17" fontWeight="700" fill="#5c806b">0 → 1/2</text>
    </>}
  </svg>
}
