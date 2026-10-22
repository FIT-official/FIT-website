import 'server-only'
import { rubricFor } from './builders.js'
import { assetUrl } from '../shared.js'
import { sourceList } from './sources.js'
import holobox from './holobox.js'
import tinylev from './tinylev.js'
import racecar from './racecar.js'
import radar from './radar.js'
import prandtl from './prandtl.js'
import cansat from './cansat.js'
import fpm from './fpm.js'
import seismometer from './seismometer.js'
import spectrometer from './spectrometer.js'
import tomography from './tomography.js'
import { LESSONS_60 } from './lessons60.js'

// Public project content only. Answer keys live in ../answerKeys.js and are never imported here,
// so nothing in this module can reach a browser bundle with a key attached.

// Exactly ten lessons: the seven originals (hardware routes conditional) and supplemental projects 08 to 10.
const RAW = [holobox, tinylev, racecar, radar, prandtl, cansat, fpm, seismometer, spectrometer, tomography]

// Checkable to-do items, namespaced by section so ids never collide.
export function todoItems(project) {
  return [
    ...project.equipment.map(i => ({ id: 'eq:' + i.id, section: 'equipment', text: i.text })),
    ...project.safety.items.map(i => ({ id: 'sf:' + i.id, section: 'safety', text: i.text })),
    ...project.buildSteps.map(i => ({ id: 'st:' + i.id, section: 'steps', text: i.title })),
    ...project.milestones.map(i => ({ id: 'ms:' + i.id, section: 'milestones', text: i.title })),
    ...project.tasks.map(i => ({ id: 'tk:' + i.id, section: 'tasks', text: i.title })),
    ...project.lesson60.steps.map(i => ({ id: 'ls:' + i.id, section: 'lesson', text: i.minutes + ' min: ' + i.title })),
  ]
}

function build(raw) {
  const diagrams = raw.diagrams.map(d => ({ ...d, src: assetUrl(d.id), label: 'Diagram (original, explanatory)' }))
  const sourceIds = new Set(raw.sourceIds)
  for (const block of [raw.published, ...raw.concepts, ...raw.buildSteps]) for (const id of block.sourceIds || []) sourceIds.add(id)
  const project = {
    ...raw,
    diagrams,
    downloads: (raw.downloads || []).map(d => ({ ...d, url: assetUrl(d.id), note: 'SYNTHETIC teaching data or a blank schema. Not a measurement.' })),
    lesson60: raw.lesson60 || LESSONS_60[raw.slug],
    readiness: raw.readiness || 'The 60-minute plan uses the on-page simulation and needs no kit or additional software account. The hardware route is conditional on teacher approval and on the equipment being available.',
    tile: { assetId: (raw.tile || { assetId: diagrams[0].id }).assetId, src: assetUrl((raw.tile || { assetId: diagrams[0].id }).assetId), alt: (raw.tile || diagrams[0]).alt },
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
    tile: p.tile,
    readiness: p.readiness,
    questionCount: p.questions.length,
    scoredMarks: p.questions.reduce((s, q) => s + q.marks, 0),
    lessonMinutes: 60,
    todoCount: p.todo.length,
  }))
}
