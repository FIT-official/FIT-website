// Client-safe helpers and labels shared by server validation and the browser UI.
// Nothing here may import answer keys or server modules.

// Protected lesson assets: diagrams and teaching files are served only by the authenticated assets route.
export const assetUrl = id => '/api/research-projects/assets?id=' + encodeURIComponent(id)

export const PLAN_FIELDS = ['question', 'model', 'dataPlan', 'uncertainty', 'improvement']

export const PLAN_LABELS = {
  question: { label: 'Bounded research question', hint: 'What exactly will you vary, hold fixed and measure, and over what range?' },
  model: { label: 'Model', hint: 'Which equations or simulation will you use, and what do they assume?' },
  dataPlan: { label: 'Measured dataset', hint: 'What will you measure, in which units, and how many repeats?' },
  uncertainty: { label: 'Uncertainty', hint: 'Which uncertainties matter most, and how will you estimate them?' },
  improvement: { label: 'Justified improvement', hint: 'Which change do you propose, what does your data say about it, and what do you predict?' },
}

export const STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted for review',
  revision_requested: 'Revision requested',
  accepted: 'Accepted',
}

export const SECTION_LABELS = {
  equipment: 'Equipment',
  safety: 'Safety checks',
  steps: 'Build and set-up steps',
  milestones: 'Milestones',
  tasks: 'Simulation and experiment tasks',
  lesson: '60-minute lesson',
}

export function emptyDocument() {
  return {
    plan: Object.fromEntries(PLAN_FIELDS.map(k => [k, ''])),
    answers: {},
    dataset: [],
    todo: {},
  }
}

export function nextRowId(rows) {
  let n = rows.length + 1
  const ids = new Set(rows.map(r => r.id))
  while (ids.has('r' + n)) n++
  return 'r' + n
}

export function makeRow(rows, source, cells = {}, note = '') {
  return {
    id: nextRowId(rows),
    source,
    note,
    cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, { v: Number.isFinite(v) ? v : null, u: null }])),
  }
}

// Type A statistics for one column. Uses only rows with a finite value.
export function columnStats(rows, columnId, source = null) {
  const values = rows
    .filter(r => !source || r.source === source)
    .map(r => r.cells?.[columnId]?.v)
    .filter(v => typeof v === 'number' && Number.isFinite(v))
  const n = values.length
  if (!n) return { n: 0, mean: null, sd: null, se: null }
  const mean = values.reduce((s, v) => s + v, 0) / n
  if (n < 2) return { n, mean, sd: null, se: null }
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1))
  return { n, mean, sd, se: sd / Math.sqrt(n) }
}

export function progressOf(todoItems, todo) {
  const total = todoItems.length
  const done = todoItems.filter(t => todo?.[t.id]).length
  return { done, total, percent: total ? Math.round((100 * done) / total) : 0 }
}
