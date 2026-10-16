import { useId } from 'react'

const labels = { sampling: 'A wave and its sensor samples', feedback: 'A temperature response approaching a target', 'base-rates': 'Inspection counts in a batch', 'heat-path': 'A patterned heat-conduction plate' }

// Original vector illustrations. No image downloads or third-party artwork.
export default function ActivityArt({ id, accent }) {
  const gradient = useId().replaceAll(':', '')
  const paper = id === 'base-rates' ? '#edf7f1' : id === 'feedback' ? '#fff1e3' : id === 'heat-path' ? '#fbeef0' : '#eff1fc'
  return <svg viewBox="0 0 480 230" role="img" aria-label={labels[id]}>
    <defs><linearGradient id={gradient} x2="1" y2="1"><stop stopColor={paper}/><stop offset="1" stopColor="#ffffff"/></linearGradient></defs>
    <rect width="480" height="230" fill={`url(#${gradient})`}/><circle cx="428" cy="25" r="90" fill={accent} opacity=".04"/>
    <g stroke={accent} opacity=".1">{[60,110,160,210].map(y => <path key={y} d={`M30 ${y}H450`}/>)}{[50,110,170,230,290,350,410].map(x => <path key={x} d={`M${x} 20V210`}/>)}</g>
    {id === 'sampling' && <><path d="M25 120C50 10 75 10 100 120S150 230 175 120S225 10 250 120S300 230 325 120S375 10 400 120S450 230 475 120" fill="none" stroke={accent} strokeWidth="3"/>{[25,70,115,160,205,250,295,340,385,430,475].map((x,i) => <circle key={x} cx={x} cy={120 + 74 * Math.sin(i * 1.13)} r="5" fill="#192c34" stroke="white" strokeWidth="2"/>)}<path d="M25 120Q145 12 250 120T475 120" fill="none" stroke="#b86b32" strokeWidth="2.5" strokeDasharray="7 5"/></>}
    {id === 'feedback' && <><path d="M35 80H445" stroke="#7e9690" strokeWidth="2" strokeDasharray="6 5"/><path d="M35 200C60 180 80 90 115 52S165 110 200 88S260 76 300 81S400 80 445 80" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round"/><path d="M35 200C80 188 80 100 132 65S186 118 220 97S290 82 445 80" fill="none" stroke="#5867ce" strokeWidth="2" strokeDasharray="6 5"/><circle cx="115" cy="52" r="6" fill={accent} stroke="white" strokeWidth="3"/><text x="342" y="64" fontSize="12" fill="#536b66">TARGET</text></>}
    {id === 'base-rates' && <>{Array.from({length:80},(_,i) => <rect key={i} x={48 + i % 16 * 25} y={43 + Math.floor(i / 16) * 30} width="14" height="18" rx="4" fill={i < 8 ? accent : i < 27 ? '#cd8a52' : '#bed1c7'}/>)}<text x="48" y="218" fontSize="12" fill="#4a655f">TRUE FLAGS</text><text x="192" y="218" fontSize="12" fill="#7a5a3b">FALSE ALARMS</text></>}
    {id === 'heat-path' && <>{Array.from({length:112},(_,i) => <rect key={i} x={40 + i % 14 * 29} y={20 + Math.floor(i / 14) * 24} width="27" height="22" rx="4" fill={i % 14 === 0 ? '#bf4548' : Math.floor(i / 14) === 4 && i % 14 < 11 ? '#db9472' : i % 14 === 7 && Math.floor(i / 14) < 4 ? '#344a52' : '#cfdfe5'}/>)}<circle cx="344" cy="129" r="13" fill="white" stroke="#283e46" strokeWidth="2"/><text x="339" y="134" fontSize="13" fill="#283e46">A</text></>}
  </svg>
}
