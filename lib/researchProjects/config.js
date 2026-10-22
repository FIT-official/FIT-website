// Central limits and activation switches for the research project library.
// Nothing here grants access: a student is allowed only when a reviewed membership
// mapping (membership.js) names a class that is also listed in ATTACHED_CLASS_IDS.

// ACTIVATION BLOCKER: production has no general class enrollment system, and the
// coordinator has not yet named which existing class receives this library.
// Empty means no student can ever be admitted. Do not populate without that review.
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
  Vary: 'Cookie',
})
