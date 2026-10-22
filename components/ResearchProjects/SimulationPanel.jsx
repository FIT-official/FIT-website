'use client'

import { useDeferredValue, useId, useMemo, useState } from 'react'
import { SIMULATIONS, runSimulation, defaultParams, formatValue } from '@/lib/researchProjects/sim'
import Chart from './Chart'
import styles from './ResearchProjects.module.css'

function ParamControl({ param, value, onCommit }) {
  const id = useId()
  const [draft, setDraft] = useState(String(value))
  const [last, setLast] = useState(value)
  if (value !== last) { setLast(value); setDraft(String(value)) }
  const parsed = draft.trim() === '' ? NaN : Number(draft)
  const invalid = !Number.isFinite(parsed) || parsed < param.min || parsed > param.max
  return (
    <div className={styles.param}>
      <label htmlFor={id}>{param.label}{param.unit ? <span className={styles.unit}> ({param.unit})</span> : null}</label>
      <div className={styles.paramRow}>
        <input type="range" aria-label={`${param.label} slider`} min={param.min} max={param.max} step={param.step} value={value}
          onChange={e => onCommit(Number(e.target.value))} />
        <input id={id} type="number" inputMode="decimal" min={param.min} max={param.max} step={param.step} value={draft}
          aria-invalid={invalid || undefined} aria-describedby={invalid ? id + '-hint' : undefined}
          onChange={e => {
            setDraft(e.target.value)
            const n = Number(e.target.value)
            if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= param.min && n <= param.max) onCommit(n)
          }}
          onBlur={() => { if (invalid) setDraft(String(value)) }} />
      </div>
      {invalid ? <p id={id + '-hint'} className={styles.fieldError}>Enter a value from {param.min} to {param.max}.</p> : null}
    </div>
  )
}

export default function SimulationPanel({ simId, onAddRow, canAdd, addDisabledReason }) {
  const sim = SIMULATIONS[simId]
  const [params, setParams] = useState(() => defaultParams(simId))
  const [added, setAdded] = useState('')
  const deferred = useDeferredValue(params)
  const result = useMemo(() => runSimulation(simId, deferred), [simId, deferred])
  const pending = deferred !== params

  return (
    <div className={styles.sim}>
      <h3>{sim.title}</h3>
      <div className={styles.simGrid}>
        <form className={styles.simControls} onSubmit={e => e.preventDefault()} aria-label="Simulation parameters">
          {sim.params.map(p => (
            <ParamControl key={p.id} param={p} value={params[p.id]} onCommit={v => { setAdded(''); setParams(prev => ({ ...prev, [p.id]: v })) }} />
          ))}
          <div className={styles.buttonRow}>
            <button type="button" className={styles.secondary} onClick={() => { setAdded(''); setParams(defaultParams(simId)) }}>Reset to defaults</button>
          </div>
        </form>
        <div className={styles.simOutput} aria-busy={pending}>
          <h4>Results {pending ? <span className={styles.unit}>(updating)</span> : null}</h4>
          {result.limiting ? <p className={styles.note}>Limiting factor: <strong>{result.limiting}</strong></p> : null}
          <table className={styles.table}>
            <thead><tr><th scope="col">Quantity</th><th scope="col">Value</th><th scope="col">Unit</th></tr></thead>
            <tbody>
              {result.outputs.map(o => (
                <tr key={o.id}><th scope="row">{o.label}</th><td>{formatValue(o.value, o.digits)}</td><td>{o.unit || '—'}</td></tr>
              ))}
            </tbody>
          </table>
          {result.warnings.length ? (
            <ul className={styles.warnings} role="status">{result.warnings.map(w => <li key={w}>{w}</li>)}</ul>
          ) : null}
          <div className={styles.buttonRow}>
            <button type="button" className={styles.primary} disabled={!canAdd}
              onClick={() => { onAddRow(result.row); setAdded('Added a simulation row to your data table.') }}>
              Add this result to the data table
            </button>
            {!canAdd && addDisabledReason ? <span className={styles.note}>{addDisabledReason}</span> : null}
            <span role="status" className={styles.note}>{added}</span>
          </div>
        </div>
      </div>
      <div className={styles.charts}>
        {result.series.map(c => <Chart key={c.id} chart={c} />)}
      </div>
      <details className={styles.assumptions} open>
        <summary>Assumptions and what this model cannot tell you</summary>
        <h4>Assumptions</h4>
        <ul>{sim.assumptions.map(a => <li key={a}>{a}</li>)}</ul>
        <h4>Caveats</h4>
        <ul>{sim.caveats.map(a => <li key={a}>{a}</li>)}</ul>
      </details>
    </div>
  )
}
