'use client'

import { useId, useMemo, useState } from 'react'
import { columnStats, makeRow } from '@/lib/researchProjects/shared'
import { fitPathLoss, formatValue } from '@/lib/researchProjects/sim'
import { LIMITS } from '@/lib/researchProjects/config'
import styles from './ResearchProjects.module.css'

// A number field that keeps what the person typed. It commits a finite number, or null when blank,
// and marks anything else invalid without discarding it.
function NumberCell({ label, value, onCommit, disabled }) {
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value))
  const [last, setLast] = useState(value)
  if (value !== last) {
    setLast(value)
    const asText = value === null || value === undefined ? '' : String(value)
    if (draft.trim() === '' ? asText !== '' : Number(draft) !== value) setDraft(asText)
  }
  const text = draft.trim()
  const parsed = text === '' ? null : Number(text)
  const invalid = text !== '' && (!Number.isFinite(parsed) || Math.abs(parsed) > LIMITS.numberMagnitude)
  return (
    <input className={styles.cell} inputMode="decimal" aria-label={label} value={draft} readOnly={disabled} aria-invalid={invalid || undefined}
      onChange={e => {
        setDraft(e.target.value)
        const t = e.target.value.trim()
        if (t === '') onCommit(null)
        else if (Number.isFinite(Number(t)) && Math.abs(Number(t)) <= LIMITS.numberMagnitude) onCommit(Number(t))
      }} />
  )
}

export default function DataTable({ columns, rows, editable, canMeasure, onChange }) {
  const statsId = useId()
  const [statsColumn, setStatsColumn] = useState(columns[0]?.id)
  const [statsSource, setStatsSource] = useState('all')
  const atLimit = rows.length >= LIMITS.datasetRows

  const setCell = (rowId, colId, part, value) => onChange(rows.map(r => {
    if (r.id !== rowId) return r
    const prev = r.cells[colId] || { v: null, u: null }
    return { ...r, cells: { ...r.cells, [colId]: { ...prev, [part]: value } } }
  }))
  const patchRow = (rowId, patch) => onChange(rows.map(r => (r.id === rowId ? { ...r, ...patch } : r)))

  const column = columns.find(c => c.id === statsColumn) || columns[0]
  const stats = useMemo(() => columnStats(rows, column?.id, statsSource === 'all' ? null : statsSource), [rows, column, statsSource])
  const hasLinkColumns = columns.some(c => c.id === 'distanceM') && columns.some(c => c.id === 'rssiDbm')
  const fit = useMemo(() => (hasLinkColumns
    ? fitPathLoss(rows.filter(r => r.source === 'measured').map(r => ({ dM: r.cells.distanceM?.v, rssiDbm: r.cells.rssiDbm?.v })))
    : null), [rows, hasLinkColumns])

  return (
    <div className={styles.dataTable}>
      <div className={styles.buttonRow}>
        <button type="button" className={styles.primary} disabled={!editable || !canMeasure || atLimit}
          onClick={() => onChange([...rows, makeRow(rows, 'measured')])}>Add a measured row</button>
        {!canMeasure ? <span className={styles.note}>Measured rows unlock after your teacher records the safety review. Simulation rows are available now.</span> : null}
        {atLimit ? <span className={styles.note}>The table is full ({LIMITS.datasetRows} rows).</span> : null}
        <span className={styles.note}>{rows.length} row{rows.length === 1 ? '' : 's'}</span>
      </div>
      {rows.length === 0 ? <p className={styles.empty}>No data yet. Run the simulation and add its result, or add a measured row.</p> : (
        <div className={styles.scroll} role="region" aria-label="Data table" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">#</th><th scope="col">Source</th><th scope="col">Note</th>
                {columns.map(c => (
                  <th scope="col" key={c.id}>{c.label}{c.unit ? <span className={styles.unit}> ({c.unit})</span> : null}{c.uncertain ? <span className={styles.unit}> ± u</span> : null}</th>
                ))}
                <th scope="col"><span className={styles.srOnly}>Remove row</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const locked = !editable
                return (
                  <tr key={r.id}>
                    <th scope="row">{i + 1}</th>
                    <td><span className={styles.badge} data-source={r.source}>{r.source === 'simulation' ? 'Simulation' : 'Measured'}</span></td>
                    <td><input className={styles.cell} aria-label={`Note, row ${i + 1}`} value={r.note} maxLength={LIMITS.noteText} readOnly={locked}
                      onChange={e => patchRow(r.id, { note: e.target.value })} /></td>
                    {columns.map(c => {
                      const cell = r.cells[c.id] || { v: null, u: null }
                      return (
                        <td key={c.id}>
                          <NumberCell label={`${c.label}, row ${i + 1}`} value={cell.v} disabled={locked} onCommit={v => setCell(r.id, c.id, 'v', v)} />
                          {c.uncertain ? <NumberCell label={`Uncertainty in ${c.label}, row ${i + 1}`} value={cell.u} disabled={locked} onCommit={v => setCell(r.id, c.id, 'u', v === null ? null : Math.abs(v))} /> : null}
                        </td>
                      )
                    })}
                    <td><button type="button" className={styles.danger} disabled={locked} aria-label={`Remove row ${i + 1}`} onClick={() => onChange(rows.filter(x => x.id !== r.id))}>Remove</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && column ? (
        <div className={styles.stats} aria-labelledby={statsId}>
          <h4 id={statsId}>Column statistics</h4>
          <div className={styles.paramRow}>
            <label>Column{' '}
              <select value={column.id} onChange={e => setStatsColumn(e.target.value)}>
                {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label>Rows{' '}
              <select value={statsSource} onChange={e => setStatsSource(e.target.value)}>
                <option value="all">All rows</option><option value="simulation">Simulation only</option><option value="measured">Measured only</option>
              </select>
            </label>
          </div>
          <p role="status">
            n = {stats.n}; mean = {formatValue(stats.mean, 4)} {column.unit}; sample s.d. = {formatValue(stats.sd, 3)}; standard error = {formatValue(stats.se, 3)}
            {stats.n < 2 ? ' (needs at least 2 values for spread)' : ''}
          </p>
          <p className={styles.note}>Standard error is the s.d. divided by √n. Combine it with your instrument reading uncertainty before drawing conclusions.</p>
        </div>
      ) : null}

      {hasLinkColumns ? (
        <div className={styles.stats}>
          <h4>Path-loss fit from your measured rows</h4>
          {fit ? (
            <p role="status">
              Exponent n = {formatValue(fit.exponent, 3)} ± {formatValue(fit.exponentSe, 2)}; received power at 1 m = {formatValue(fit.rssiAt1m, 4)} ± {formatValue(fit.rssiAt1mSe, 2)} dBm; residual s.d. = {formatValue(fit.residualSd, 3)} dB ({fit.count} points). Free space would give n = 2.
            </p>
          ) : <p className={styles.note}>Needs at least three measured rows with different positive distances and a signal strength.</p>}
        </div>
      ) : null}
    </div>
  )
}
