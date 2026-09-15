/**
 * Pure price estimate for a creator print job: max(minimumCharge, grams x
 * pricePerGram), rounded to cents. The estimate is indicative only — the
 * creator sets the real quote from /dashboard/print-jobs.
 *
 * @param {{ grams?: number|null, pricePerGram?: number, minimumCharge?: number }} args
 * @returns {{ ok: true, amount: number, fromMinimum: boolean } | { ok: false, reason: string }}
 */
export function estimateCreatorPrintPrice({ grams, pricePerGram, minimumCharge = 0 } = {}) {
    const g = Number(grams)
    const rate = Number(pricePerGram)
    const min = Math.max(0, Number(minimumCharge) || 0)
    if (!Number.isFinite(g) || g <= 0) return { ok: false, reason: 'no-grams' }
    if (!Number.isFinite(rate) || rate < 0) return { ok: false, reason: 'no-rate' }
    const byWeight = g * rate
    const amount = Math.max(min, byWeight)
    return { ok: true, amount: Math.round(amount * 100) / 100, fromMinimum: min > byWeight }
}
