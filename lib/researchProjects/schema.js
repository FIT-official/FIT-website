import { LIMITS, ID_PATTERN } from './config.js'
import { PLAN_FIELDS, emptyDocument } from './shared.js'

// Input validation for everything a client may send. Unknown keys are rejected rather than
// ignored, sizes are bounded, and every id must exist in the public project definition.
// Class, group, seat and user identity are never read from request data.

export class ValidationError extends Error {
  constructor(message, path = '') {
    super(message)
    this.name = 'ValidationError'
    this.status = 400
    this.code = 'invalid'
    this.path = path
  }
}

const NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype

function exactKeys(obj, allowed, path) {
  if (!isPlainObject(obj)) throw new ValidationError('Expected an object.', path)
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) throw new ValidationError('Unexpected field “' + key.slice(0, 40) + '”.', path)
  }
}

function text(value, max, path) {
  if (typeof value !== 'string') throw new ValidationError('Expected text.', path)
  if (value.length > max) throw new ValidationError('Text is too long (limit ' + max + ' characters).', path)
  if (CONTROL.test(value)) throw new ValidationError('Text contains unsupported control characters.', path)
  return value
}

function finite(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > LIMITS.numberMagnitude) {
    throw new ValidationError('Expected a finite number.', path)
  }
  return value
}

export const emptyDoc = emptyDocument

function checkPlan(input, path) {
  exactKeys(input, PLAN_FIELDS, path)
  const out = Object.fromEntries(PLAN_FIELDS.map(k => [k, '']))
  for (const key of Object.keys(input)) out[key] = text(input[key], LIMITS.planText, path + '.' + key)
  return out
}

function checkAnswer(question, input, path) {
  exactKeys(input, ['choice', 'value', 'text'], path)
  const out = {}
  if (input.choice !== undefined) {
    if (question.type !== 'mcq') throw new ValidationError('This question is not multiple choice.', path)
    if (!question.options.some(o => o.id === input.choice)) throw new ValidationError('Unknown option.', path + '.choice')
    out.choice = input.choice
  }
  if (input.value !== undefined) {
    if (question.type !== 'calculation') throw new ValidationError('This question has no numeric value.', path)
    const v = text(input.value, 32, path + '.value').trim()
    if (v !== '' && !NUMBER_PATTERN.test(v)) throw new ValidationError('Enter a number such as 12.5 or 1.2e-3.', path + '.value')
    if (v !== '' && !Number.isFinite(Number(v))) throw new ValidationError('Number out of range.', path + '.value')
    out.value = v
  }
  if (input.text !== undefined) {
    if (question.type === 'mcq') throw new ValidationError('Multiple-choice answers have no text.', path)
    out.text = text(input.text, LIMITS.longText, path + '.text')
  }
  return out
}

function checkAnswers(project, input, path) {
  if (!isPlainObject(input)) throw new ValidationError('Expected an object.', path)
  const byId = new Map(project.questions.map(q => [q.id, q]))
  const out = {}
  for (const id of Object.keys(input)) {
    const question = byId.get(id)
    if (!question) throw new ValidationError('Unknown question.', path)
    const answer = checkAnswer(question, input[id], path + '.' + id)
    if (Object.keys(answer).length) out[id] = answer
  }
  return out
}

function checkDataset(project, input, path) {
  if (!Array.isArray(input)) throw new ValidationError('Expected a list of rows.', path)
  if (input.length > LIMITS.datasetRows) throw new ValidationError('Too many rows (limit ' + LIMITS.datasetRows + ').', path)
  const columns = new Map(project.dataset.columns.map(c => [c.id, c]))
  const seen = new Set()
  return input.map((row, i) => {
    const p = path + '[' + i + ']'
    exactKeys(row, ['id', 'source', 'note', 'cells'], p)
    if (typeof row.id !== 'string' || !ID_PATTERN.test(row.id)) throw new ValidationError('Invalid row id.', p + '.id')
    if (seen.has(row.id)) throw new ValidationError('Duplicate row id.', p + '.id')
    seen.add(row.id)
    if (row.source !== 'simulation' && row.source !== 'measured') throw new ValidationError('Source must be simulation or measured.', p + '.source')
    const cells = {}
    if (!isPlainObject(row.cells)) throw new ValidationError('Expected cells.', p + '.cells')
    for (const colId of Object.keys(row.cells)) {
      const col = columns.get(colId)
      if (!col) throw new ValidationError('Unknown column.', p + '.cells')
      const cell = row.cells[colId]
      exactKeys(cell, ['v', 'u'], p + '.cells.' + colId)
      const v = cell.v === null || cell.v === undefined ? null : finite(cell.v, p + '.cells.' + colId + '.v')
      let u = null
      if (cell.u !== null && cell.u !== undefined) {
        if (!col.uncertain) throw new ValidationError('This column does not take an uncertainty.', p + '.cells.' + colId + '.u')
        u = finite(cell.u, p + '.cells.' + colId + '.u')
        if (u < 0) throw new ValidationError('Uncertainty cannot be negative.', p + '.cells.' + colId + '.u')
      }
      cells[colId] = { v, u }
    }
    return { id: row.id, source: row.source, note: text(row.note ?? '', LIMITS.noteText, p + '.note'), cells }
  })
}

function checkTodo(project, input, path) {
  if (!isPlainObject(input)) throw new ValidationError('Expected an object.', path)
  const valid = new Set(project.todo.map(t => t.id))
  const out = {}
  for (const id of Object.keys(input)) {
    if (!valid.has(id)) throw new ValidationError('Unknown to-do item.', path)
    if (typeof input[id] !== 'boolean') throw new ValidationError('Expected true or false.', path)
    if (input[id]) out[id] = true
  }
  return out
}

// Returns a fresh, normalised document. Anything not listed here is rejected.
export function validateDoc(project, input) {
  exactKeys(input, ['plan', 'answers', 'dataset', 'todo'], 'doc')
  return {
    plan: input.plan === undefined ? emptyDoc().plan : checkPlan(input.plan, 'doc.plan'),
    answers: input.answers === undefined ? {} : checkAnswers(project, input.answers, 'doc.answers'),
    dataset: input.dataset === undefined ? [] : checkDataset(project, input.dataset, 'doc.dataset'),
    todo: input.todo === undefined ? {} : checkTodo(project, input.todo, 'doc.todo'),
  }
}

export function validateRevision(value, path = 'baseRevision') {
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) throw new ValidationError('Invalid revision.', path)
  return value
}

export function validateScope(value, path = 'scope') {
  if (typeof value !== 'string' || !/^(group|member):[A-Za-z0-9_.-]{1,64}$/.test(value)) throw new ValidationError('Invalid scope.', path)
  return value
}

export function validateClassId(value, path = 'classId') {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new ValidationError('Invalid class.', path)
  return value
}

export function validateRubric(project, input) {
  if (!isPlainObject(input)) throw new ValidationError('Expected rubric scores.', 'rubric')
  const ids = new Set(project.rubric.map(c => c.id))
  const out = {}
  for (const id of Object.keys(input)) {
    if (!ids.has(id)) throw new ValidationError('Unknown rubric criterion.', 'rubric')
    const n = input[id]
    if (!Number.isInteger(n) || n < 1 || n > 4) throw new ValidationError('Scores are whole numbers from 1 to 4.', 'rubric.' + id)
    out[id] = n
  }
  return out
}

export function validateComment(value) {
  return text(value ?? '', LIMITS.commentText, 'comment')
}

export { text as validateText }
