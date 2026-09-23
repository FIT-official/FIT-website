/**
 * Creator actions on a print job they handle (/dashboard/print-jobs), mapped
 * onto the EXISTING CustomPrintRequest status vocabulary — no new statuses.
 * Payment for creator jobs is arranged off-platform until Stripe Connect
 * lands, so "accept" records the job as paid/confirmed by the creator.
 *
 *   quote     -> quoted      (from pending_config | configured | quoted)
 *   accept    -> paid        (from quoted | payment_pending)
 *   printing  -> printing    (from paid)
 *   ready     -> printed     (from printing)
 *   completed -> delivered   (from printed | shipped)
 *   reject    -> cancelled   (from anything not delivered/cancelled)
 *
 * Pure: `(action, currentStatus)` -> `{ ok, status }` | `{ ok, error }`.
 */
export const CREATOR_JOB_ACTIONS = Object.freeze({
    quote: { to: 'quoted', from: ['pending_config', 'configured', 'quoted'] },
    accept: { to: 'paid', from: ['quoted', 'payment_pending'] },
    printing: { to: 'printing', from: ['paid'] },
    ready: { to: 'printed', from: ['printing'] },
    completed: { to: 'delivered', from: ['printed', 'shipped'] },
    reject: {
        to: 'cancelled',
        from: ['pending_upload', 'pending_config', 'configured', 'quoted', 'payment_pending', 'paid', 'printing', 'printed', 'shipped'],
    },
})

/** Actions the UI may offer for a job in `status` (in display order). */
export function availableCreatorActions(status) {
    return Object.entries(CREATOR_JOB_ACTIONS)
        .filter(([, rule]) => rule.from.includes(status))
        .map(([action]) => action)
}

/**
 * @returns {{ ok: true, status: string } | { ok: false, error: string }}
 */
export function resolveCreatorJobTransition(action, currentStatus) {
    const rule = CREATOR_JOB_ACTIONS[action]
    if (!rule) return { ok: false, error: `Unknown action "${action}"` }
    if (!rule.from.includes(currentStatus)) {
        return { ok: false, error: `Cannot ${action} a job that is ${currentStatus}` }
    }
    return { ok: true, status: rule.to }
}
