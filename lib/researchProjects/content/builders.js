// Small constructors that keep project content declarative. Strings may contain `$...$` maths.

export const tex = String.raw

// options[0] is the correct answer as written; it is moved to index at (0 to 3) so the key is not always 'a'.
// The public content never records which option is correct.
export const mcq = (id, prompt, options, marks = 2, at = 0) => {
  const [right, ...rest] = options
  const ordered = [...rest.slice(0, at), right, ...rest.slice(at)]
  return { id, type: 'mcq', prompt, marks, options: ordered.map((text, i) => ({ id: 'abcd'[i], text })) }
}

export const calc = (id, prompt, unit, marks = 3) => ({ id, type: 'calculation', prompt, unit, marks })

export const written = (type, id, prompt, marks = 4) => ({ id, type, prompt, marks })

export const short = (id, prompt, marks = 3) => written('short', id, prompt, marks)
export const derive = (id, prompt, marks = 5) => written('derivation', id, prompt, marks)
export const explain = (id, prompt, marks = 4) => written('explain', id, prompt, marks)
export const reflect = (id, prompt, marks = 3) => written('reflection', id, prompt, marks)

export const item = (id, text, extra = {}) => ({ id, text, ...extra })

export const column = (id, label, unit, kind, uncertain = false) => ({ id, label, unit, kind, uncertain })

// Shared rubric: four levels per criterion. Each project supplies a `focus` line per criterion.
export const RUBRIC_CRITERIA = [
  { id: 'question', label: 'Bounded research question', levels: [
    'Question is broad, or not testable with the team’s equipment.',
    'Question is testable but variables, range or success measure are vague.',
    'Question names what is varied, what is held fixed and what is measured, with a realistic range.',
    'As secure, and the team explains why the bounds were chosen and what lies outside them.',
  ] },
  { id: 'model', label: 'Model and assumptions', levels: [
    'Model is quoted without saying what it assumes.',
    'Model is used correctly but assumptions or valid ranges are incomplete.',
    'Model, units and assumptions are stated and a prediction is compared with data.',
    'As secure, and the team tests where a stated assumption fails.',
  ] },
  { id: 'data', label: 'Measured dataset', levels: [
    'Few rows, mixed units, or simulation rows presented as measurements.',
    'Adequate rows with units, but repeats or conditions are not recorded.',
    'Repeated, labelled, unit-consistent rows that cover the stated range, with simulation and measurement kept apart.',
    'As secure, and anomalous rows are investigated rather than discarded.',
  ] },
  { id: 'uncertainty', label: 'Uncertainty', levels: [
    'No uncertainty is stated.',
    'Uncertainty is stated for some values without a method.',
    'Instrument and repeat uncertainty are estimated, and conclusions are limited by them.',
    'As secure, and the dominant uncertainty is identified and reduced in a follow-up.',
  ] },
  { id: 'improvement', label: 'Justified improvement', levels: [
    'No change is proposed.',
    'A change is proposed without evidence.',
    'One change is justified by the team’s own data and tested or planned with a prediction.',
    'As secure, and the result is compared with the prediction, including when it disagrees.',
  ] },
  { id: 'safety', label: 'Safety and sources', levels: [
    'Safety checks are skipped or sources are not credited.',
    'Safety checks are ticked but not applied; some sources are credited.',
    'Safety review is applied to the actual set-up and sources are cited where used.',
    'As secure, and the team states what they did not verify or could not access.',
  ] },
]

export function rubricFor(focus) {
  return RUBRIC_CRITERIA.map(c => ({ ...c, focus: focus[c.id] }))
}
