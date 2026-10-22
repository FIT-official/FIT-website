// Central limits and activation switches for the research project library.
// Nothing here grants access: personal work exists only when a reviewed membership
// mapping (membership.js) names an audience id that is also listed in ATTACHED_CLASS_IDS.

// ACTIVATION BLOCKER: production has no general class enrollment system. The intended audience is exactly two
// verified owner accounts (no student cohort, no migration). The integration owner binds them through the
// exact owner resolver; until then this is empty, so no personal work is ever opened, and review stays
// default-deny (see access.js). "classId" is simply the audience id used to scope saved records.
export const ATTACHED_CLASS_IDS = Object.freeze([])

export const COLLECTION = 'researchProjectRecords'

export const LIMITS = Object.freeze({
  bodyBytes: 160_000,
  shortText: 400,
  longText: 4_000,
  planText: 2_000,
  noteText: 200,
  commentText: 2_000,
  datasetRows: 100,
  numberMagnitude: 1e15,
  events: 60,
  feedback: 40,
  submissions: 5,
  minPlanChars: 20,
  minDatasetRowsToSubmit: 3,
})

export const STATUS = Object.freeze({
  draft: 'draft',
  submitted: 'submitted',
  revision: 'revision_requested',
  accepted: 'accepted',
})

// Students may change a record only while it is theirs to edit.
export const STUDENT_EDITABLE = Object.freeze([STATUS.draft, STATUS.revision])

export const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/

export const PRIVATE_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Cookie',
})
