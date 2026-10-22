'use client'

import RichText, { Formula } from './RichText'
import Checklist from './Checklist'
import SimulationPanel from './SimulationPanel'
import DataTable from './DataTable'
import QuestionList from './QuestionList'
import { PLAN_FIELDS, PLAN_LABELS, SECTION_LABELS, progressOf } from '@/lib/researchProjects/shared'
import { LIMITS } from '@/lib/researchProjects/config'
import styles from './ResearchProjects.module.css'

const STATUS_NOTE = {
  read: 'opened and read for this library on 22 October 2026',
  reference: 'cited reference for the physics; not opened for this library',
  unavailable: 'could not be loaded when checked; nothing is described from it',
}

export function SourceNote({ ids, sources, label = 'Background' }) {
  if (!ids?.length) return null
  const byId = new Map(sources.map(s => [s.id, s]))
  return (
    <p className={styles.sourceNote}>
      <span className={styles.tag}>{label}{label === 'Source' && ids.length > 1 ? 's' : ''}</span>{' '}
      {ids.map((id, i) => {
        const s = byId.get(id)
        if (!s) return null
        return (
          <span key={id}>
            {i > 0 ? '; ' : ''}
            {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> : s.title}
            {' '}<span className={styles.unit}>({STATUS_NOTE[s.status]})</span>
          </span>
        )
      })}
    </p>
  )
}

function Diagram({ diagram }) {
  return (
    <figure className={styles.diagram}>
      <span className={styles.diagramLabel}>{diagram.label}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={diagram.src} alt={diagram.alt} width="640" height="380" loading="lazy" />
      <figcaption><strong>{diagram.title}.</strong> {diagram.caption}</figcaption>
    </figure>
  )
}

function Section({ id, title, children }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={id + '-h'}>
      <h2 id={id + '-h'}>{title}</h2>
      {children}
    </section>
  )
}

export const SECTIONS = [
  ['overview', 'Overview'], ['concepts', 'Concepts'], ['build', 'Build steps'], ['safety', 'Equipment and safety'],
  ['milestones', 'Milestones and tasks'], ['plan', 'Team plan'], ['simulation', 'Simulation'], ['data', 'Data'],
  ['questions', 'Questions'], ['rubric', 'Rubric'], ['sources', 'Sources'],
]

// All instructional content plus the editable parts. `editable` false renders the same view read-only.
export default function ProjectBody({
  project, doc, editable, canMeasure, onToggle, onPlan, onAnswer, onDataset, onAddSimRow, simDisabledReason, keys, auto, extra,
}) {
  const toggleSection = (section, label) => {
    const items = project.todo.filter(t => t.section === section)
    return <Checklist items={items} todo={doc.todo} editable={editable} onToggle={onToggle} label={label} />
  }
  const progress = progressOf(project.todo, doc.todo)
  const stepItems = new Map(project.todo.filter(t => t.section === 'steps').map(t => [t.id.slice(3), t]))
  const diagramFor = id => project.diagrams.find(d => d.id === id)
  const milestoneItems = project.todo.filter(t => t.section === 'milestones').map((t, i) => ({ ...t, detail: '— ' + project.milestones[i].evidence }))
  const taskItems = project.todo.filter(t => t.section === 'tasks')

  return (
    <div className={styles.body}>
      <nav className={styles.sectionNav} aria-label="Sections on this page">
        <ul>{SECTIONS.map(([id, label]) => <li key={id}><a href={'#' + id}>{label}</a></li>)}</ul>
      </nav>

      <div className={styles.progress}>
        <label htmlFor="todo-progress">To-do progress: {progress.done} of {progress.total} items ({progress.percent}%)</label>
        <progress id="todo-progress" max={progress.total} value={progress.done} />
      </div>

      {extra}

      <Section id="overview" title="Overview">
        <p className={styles.meta}>{project.field} · {project.level}</p>
        <p className={styles.note}>{project.pacing}</p>
        <div className={styles.question}>
          <h3>Research question</h3>
          <p><RichText text={project.researchQuestion} /></p>
        </div>
        <div className={styles.twoUp}>
          <div className={styles.callout} data-kind="published">
            <h3>{project.published.label}</h3>
            <p><RichText text={project.published.text} /></p>
            <SourceNote ids={project.published.sourceIds} sources={project.sources} label="Source" />
          </div>
          <div className={styles.callout} data-kind="proposed">
            <h3>{project.proposed.label}</h3>
            <p><RichText text={project.proposed.text} /></p>
          </div>
        </div>
        <h3>Before you start</h3>
        <ul>{project.prerequisites.map(p => <li key={p}><RichText text={p} /></li>)}</ul>
        <h3>Specific cautions</h3>
        <ul className={styles.warnings}>{project.caveats.map(c => <li key={c}><RichText text={c} /></li>)}</ul>
      </Section>

      <Section id="concepts" title="Concepts">
        {project.concepts.map(c => (
          <article key={c.id} className={styles.concept}>
            <h3>{c.title}</h3>
            <p><RichText text={c.body} /></p>
            {c.equations.map(eq => (
              <figure key={eq.tex} className={styles.equation}>
                <Formula tex={eq.tex} display />
                <figcaption>{eq.caption}</figcaption>
              </figure>
            ))}
            <SourceNote ids={c.sourceIds} sources={project.sources} />
          </article>
        ))}
      </Section>

      <Section id="build" title="Build and set-up steps">
        <p className={styles.note}>These steps describe your team’s <em>proposed</em> investigation. They are not instructions copied from a published kit, and diagrams are original illustrations.</p>
        <ol className={styles.steps}>
          {project.buildSteps.map((s, i) => {
            const diagram = s.diagramId ? diagramFor(s.diagramId) : null
            const todo = stepItems.get(s.id)
            return (
              <li key={s.id}>
                <h3>Step {i + 1}: {s.title}</h3>
                <p><RichText text={s.body} /></p>
                {diagram ? <Diagram diagram={diagram} /> : null}
                <SourceNote ids={s.sourceIds} sources={project.sources} />
                {todo ? (
                  <label className={styles.stepDone}>
                    <input type="checkbox" checked={!!doc.todo[todo.id]} disabled={!editable} onChange={() => onToggle(todo.id)} /> Mark step {i + 1} done
                  </label>
                ) : null}
              </li>
            )
          })}
        </ol>
      </Section>

      <Section id="safety" title="Equipment and safety">
        <h3>{SECTION_LABELS.equipment}</h3>
        <p className={styles.note}>Confirm what your team has. No prices or stock information is given here.</p>
        {toggleSection('equipment', 'Equipment checklist')}
        <h3>{SECTION_LABELS.safety}</h3>
        <p className={styles.note}>{project.safety.intro} All safety items must be confirmed before you can submit.</p>
        {toggleSection('safety', 'Safety checklist')}
      </Section>

      <Section id="milestones" title="Milestones and tasks">
        <h3>{SECTION_LABELS.milestones}</h3>
        <Checklist items={milestoneItems} todo={doc.todo} editable={editable} onToggle={onToggle} label="Milestones" />
        <h3>{SECTION_LABELS.tasks}</h3>
        <ul className={styles.tasks}>
          {taskItems.map((t, i) => {
            const task = project.tasks[i]
            return (
              <li key={t.id}>
                <label>
                  <input type="checkbox" checked={!!doc.todo[t.id]} disabled={!editable} onChange={() => onToggle(t.id)} />
                  <span><span className={styles.tag}>{task.kind === 'simulation' ? 'Simulation' : 'Experiment'}</span> <strong>{task.title}.</strong> <RichText text={task.body} /></span>
                </label>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section id="plan" title="Team plan">
        <p className={styles.note}>Your team owns a bounded question, a model, a measured dataset, an uncertainty estimate and one justified improvement. Teammates share this plan.</p>
        {PLAN_FIELDS.map(f => (
          <div key={f} className={styles.block}>
            <label htmlFor={'plan-' + f} className={styles.labelStrong}>{PLAN_LABELS[f].label}</label>
            <span id={'plan-' + f + '-hint'} className={styles.note}>{PLAN_LABELS[f].hint}</span>
            <textarea id={'plan-' + f} aria-describedby={'plan-' + f + '-hint'} rows={4} value={doc.plan[f] ?? ''} readOnly={!editable}
              maxLength={LIMITS.planText} onChange={e => onPlan(f, e.target.value)} />
            <span className={styles.note}>{(doc.plan[f] ?? '').length} / {LIMITS.planText}</span>
          </div>
        ))}
      </Section>

      <Section id="simulation" title="Simulation">
        <SimulationPanel simId={project.simId} canAdd={editable && doc.dataset.length < LIMITS.datasetRows} addDisabledReason={editable ? '' : simDisabledReason}
          onAddRow={onAddSimRow} />
      </Section>

      <Section id="data" title="Data table, units and uncertainty">
        <p className={styles.note}>{project.dataset.intro}</p>
        <DataTable columns={project.dataset.columns} rows={doc.dataset} editable={editable} canMeasure={canMeasure} onChange={onDataset} />
      </Section>

      <Section id="questions" title="Questions">
        <QuestionList questions={project.questions} answers={doc.answers} editable={editable} onAnswer={onAnswer} keys={keys} auto={auto} />
      </Section>

      <Section id="rubric" title="Rubric">
        <p className={styles.note}>Your teacher scores each criterion from 1 to 4. “In this project” says what secure work looks like here.</p>
        <div className={styles.scroll} role="region" aria-label="Rubric" tabIndex={0}>
          <table className={styles.table}>
            <thead><tr><th scope="col">Criterion</th><th scope="col">1</th><th scope="col">2</th><th scope="col">3</th><th scope="col">4</th><th scope="col">In this project</th></tr></thead>
            <tbody>
              {project.rubric.map(c => (
                <tr key={c.id}>
                  <th scope="row">{c.label}</th>
                  {c.levels.map(l => <td key={l}>{l}</td>)}
                  <td><RichText text={c.focus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="sources" title="Sources and attribution">
        <p className={styles.note}>Each source is credited where it is used. “Read” means it was opened and read for this library; “cited reference” means it is standard literature for the physics that was not opened here.</p>
        <ul className={styles.sources}>
          {project.sources.map(s => (
            <li key={s.id}>
              {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> : <span>{s.title}</span>}
              <span className={styles.unit}> — {s.publisher}, {s.year}</span>
              <span className={styles.badge} data-source={s.status === 'read' ? 'simulation' : 'measured'}>{s.status === 'read' ? 'Read' : s.status === 'reference' ? 'Cited reference' : 'Not available'}</span>
              <p className={styles.note}>{s.note}</p>
            </li>
          ))}
        </ul>
        <p className={styles.note}>Diagrams on this page are original explanatory illustrations created for this library. They are not photographs, and none of the published builds named above has been built by FIT.</p>
      </Section>
    </div>
  )
}
