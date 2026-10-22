import { formatValue } from '@/lib/researchProjects/sim'
import styles from './ResearchProjects.module.css'

const COLOURS = ['#1f5fa8', '#b45309', '#1b7a4b', '#7a3b9e']
const W = 480
const H = 270
const M = { l: 56, r: 14, t: 14, b: 44 }

function extent(values) {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (!Number.isFinite(lo)) return [0, 1]
  if (lo === hi) return [lo - 0.5, hi + 0.5]
  const pad = (hi - lo) * 0.05
  return [lo - pad, hi + pad]
}

// Line chart drawn as SVG, with a text summary and a small data table for non-visual access.
export default function Chart({ chart }) {
  const xs = chart.traces.flatMap(t => t.x)
  const ys = chart.traces.flatMap(t => t.y)
  const [x0, x1] = extent(xs)
  const [y0, y1] = extent(ys)
  const px = x => M.l + ((x - x0) / (x1 - x0)) * (W - M.l - M.r)
  const py = y => H - M.b - ((y - y0) / (y1 - y0)) * (H - M.t - M.b)
  const summary = `${chart.title}. ${chart.traces.map(t => t.label).join(', ')}. ${chart.xLabel} from ${formatValue(x0)} to ${formatValue(x1)}; ${chart.yLabel} from ${formatValue(y0)} to ${formatValue(y1)}.`
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  return (
    <figure className={styles.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        <rect x="0" y="0" width={W} height={H} fill="#fff" />
        {ticks.map(f => {
          const x = x0 + f * (x1 - x0)
          const y = y0 + f * (y1 - y0)
          return (
            <g key={f} aria-hidden="true">
              <line x1={px(x)} y1={M.t} x2={px(x)} y2={H - M.b} stroke="#e6e6e6" />
              <line x1={M.l} y1={py(y)} x2={W - M.r} y2={py(y)} stroke="#e6e6e6" />
              <text x={px(x)} y={H - M.b + 16} fontSize="11" textAnchor="middle" fill="#444">{formatValue(x, 3)}</text>
              <text x={M.l - 6} y={py(y) + 4} fontSize="11" textAnchor="end" fill="#444">{formatValue(y, 3)}</text>
            </g>
          )
        })}
        <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="none" stroke="#8e8f90" />
        {chart.traces.map((t, i) => (
          <polyline key={t.label} fill="none" stroke={COLOURS[i % COLOURS.length]} strokeWidth="2" strokeDasharray={i === 0 ? undefined : i === 1 ? '6 4' : '2 3'}
            points={t.x.map((x, j) => `${px(x).toFixed(1)},${py(t.y[j]).toFixed(1)}`).join(' ')} />
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 6} fontSize="12" textAnchor="middle" fill="#111">{chart.xLabel}</text>
        <text x="12" y={(M.t + H - M.b) / 2} fontSize="12" textAnchor="middle" fill="#111" transform={`rotate(-90 12 ${(M.t + H - M.b) / 2})`}>{chart.yLabel}</text>
      </svg>
      <figcaption>
        <strong>{chart.title}</strong>
        <span className={styles.legend}>
          {chart.traces.map((t, i) => <span key={t.label}><i style={{ background: COLOURS[i % COLOURS.length] }} aria-hidden="true" />{t.label}</span>)}
        </span>
      </figcaption>
      <details>
        <summary>Show values as a table</summary>
        <div className={styles.scroll} role="region" aria-label={`${chart.title} values`} tabIndex={0}>
          <table className={styles.table}>
            <thead><tr><th scope="col">{chart.xLabel}</th>{chart.traces.map(t => <th scope="col" key={t.label}>{t.label}</th>)}</tr></thead>
            <tbody>
              {sampleIndices(chart.traces[0].x.length, 10).map(j => (
                <tr key={j}>
                  <td>{formatValue(chart.traces[0].x[j])}</td>
                  {chart.traces.map(t => <td key={t.label}>{formatValue(t.y[Math.min(j, t.y.length - 1)])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

function sampleIndices(n, count) {
  if (n <= count) return Array.from({ length: n }, (_, i) => i)
  return Array.from({ length: count }, (_, i) => Math.round((i * (n - 1)) / (count - 1)))
}
