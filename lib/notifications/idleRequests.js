/**
 * Pure selection logic for the "idle / unconfigured" custom-print nudge. No I/O
 * — given a list of request-like objects and the current time, decide which
 * ones deserve a gentle reminder email. The cron route (the side-effecty edge)
 * queries candidates, calls this, sends, and stamps `idleNudgeSentAt`.
 *
 * A request is nudge-worthy when ALL hold:
 *  - its status is an actionable pre-payment state (the customer can move it
 *    forward themselves): pending_config (uploaded, not configured),
 *    configured (configured, not quoted), or quoted (quoted, not paid);
 *  - it has had no activity for at least `idleDays` (by `updatedAt`);
 *  - we haven't nudged it within `cooldownDays` (by `idleNudgeSentAt`);
 *  - it has a customer email to send to.
 *
 * `pending_upload` is excluded: with no model uploaded there's nothing tied to
 * the request worth chasing, and such rows are often abandoned placeholders.
 */

export const NUDGE_ELIGIBLE_STATUSES = Object.freeze([
  'pending_config',
  'configured',
  'quoted',
])

const DAY_MS = 24 * 60 * 60 * 1000

function toTime(value) {
  if (!value) return null
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * @param {Array<object>} requests - request-like { status, userEmail,
 *   updatedAt, idleNudgeSentAt }
 * @param {{ now?: Date|number, idleDays?: number, cooldownDays?: number }} [opts]
 * @returns {Array<object>} the subset that should be nudged now
 */
export function selectIdleRequests(requests = [], opts = {}) {
  if (!Array.isArray(requests)) return []
  const now = toTime(opts.now) ?? Date.now()
  const idleMs = (Number(opts.idleDays) > 0 ? Number(opts.idleDays) : 3) * DAY_MS
  const cooldownMs = (Number(opts.cooldownDays) > 0 ? Number(opts.cooldownDays) : 7) * DAY_MS

  return requests.filter((r) => {
    if (!r || !r.userEmail || r.paidAt) return false
    if (r.status === 'configured' && (r.quoteMode === 'manual' || r.creatorUserId || r.guidedBrief)) return false
    if (!NUDGE_ELIGIBLE_STATUSES.includes(r.status)) return false

    const lastActivity = toTime(r.updatedAt)
    if (lastActivity == null) return false
    if (now - lastActivity < idleMs) return false

    const lastNudge = toTime(r.idleNudgeSentAt)
    if (lastNudge != null && now - lastNudge < cooldownMs) return false

    return true
  })
}
