import { rubricFor } from './builders.js'
import { sourceList } from './sources.js'
import holobox from './holobox.js'
import tinylev from './tinylev.js'
import racecar from './racecar.js'
import radar from './radar.js'
import prandtl from './prandtl.js'
import cansat from './cansat.js'
import fpm from './fpm.js'

// Public project content only. Answer keys live in ../answerKeys.js and are never imported here,
// so nothing in this module can reach a browser bundle with a key attached.

const RAW = [holobox, tinylev, racecar, radar, prandtl, cansat, fpm]

export const DIAGRAM_BASE = '/research-projects/diagrams/'

// Checkable to-do items, namespaced by section so ids never collide.
export function todoItems(project) {
  return [
    ...project.equipment.map(i => ({ id: 'eq:' + i.id, section: 'equipment', text: i.text })),
    ...project.safety.items.map(i => ({ id: 'sf:' + i.id, section: 'safety', text: i.text })),
    ...project.buildSteps.map(i => ({ id: 'st:' + i.id, section: 'steps', text: i.title })),
    ...project.milestones.map(i => ({ id: 'ms:' + i.id, section: 'milestones', text: i.title })),
    ...project.tasks.map(i => ({ id: 'tk:' + i.id, section: 'tasks', text: i.title })),
  ]
}

function build(raw) {
  const sourceIds = new Set(raw.sourceIds)
  for (const block of [raw.published, ...raw.concepts, ...raw.buildSteps]) for (const id of block.sourceIds || []) sourceIds.add(id)
  const project = {
    ...raw,
    diagrams: raw.diagrams.map(d => ({ ...d, src: DIAGRAM_BASE + d.id + '.svg', label: 'Diagram (original, explanatory)' })),
    rubric: rubricFor(raw.rubricFocus),
    sources: sourceList([...sourceIds]),
  }
  delete project.rubricFocus
  project.todo = todoItems(project)
  return project
}

export const PROJECTS = Object.freeze(RAW.map(build))
export const PROJECT_SLUGS = Object.freeze(PROJECTS.map(p => p.slug))

const BY_SLUG = new Map(PROJECTS.map(p => [p.slug, p]))

export function getProject(slug) {
  return typeof slug === 'string' ? BY_SLUG.get(slug) || null : null
}

export function isProjectSlug(slug) {
  return typeof slug === 'string' && BY_SLUG.has(slug)
}

export function projectSummaries() {
  return PROJECTS.map(p => ({
    slug: p.slug,
    title: p.title,
    shortTitle: p.shortTitle,
    field: p.field,
    level: p.level,
    summary: p.summary,
    publishedKind: p.published.label,
    proposedKind: p.proposed.label,
    questionCount: p.questions.length,
    todoCount: p.todo.length,
  }))
}
