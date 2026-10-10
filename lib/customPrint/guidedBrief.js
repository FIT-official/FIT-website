// Customer preferences are a brief, never measured geometry or a payable quote.
export const GUIDED_FILE_BYTES = 3 * 1024 * 1024
export const GUIDED_CATEGORIES = ['Everyday use', 'Organising', 'Replacement part', 'Gift or display', 'Prototype', 'Something else']
export const GUIDED_START = { purpose: '', category: 'Everyday use', sourceUrl: '', sizeMode: 'help', size: '', unit: 'mm', quantity: 1, material: 'help', colour: 'Help me choose', rights: 'unknown', permissionNote: '', notes: '' }
export function publicReference(value) {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const u = new URL(value.trim())
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || !u.hostname.includes('.') || /[\[\]:]/.test(u.hostname) || /^[\d.]+$/.test(u.hostname) || /(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname)) return null
    return u.href.length <= 2048 ? u.href : null
  } catch { return null }
}
const text = (value, max) => typeof value === 'string' && value.trim().length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) ? value.trim() : null
export function validateGuidedBrief(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Describe what you would like printed.' }
  const purpose = text(input.purpose, 300), notes = text(input.notes ?? '', 1000), permissionNote = text(input.permissionNote ?? '', 1000), colour = text(input.colour, 100)
  if (!purpose || notes === null || permissionNote === null || !colour) return { error: 'Enter a purpose, colour preference and notes within the displayed limits.' }
  if (!GUIDED_CATEGORIES.includes(input.category)) return { error: 'Choose a category.' }
  if (!['help', 'pla', 'petg', 'abs', 'tpu', 'other'].includes(input.material)) return { error: 'Choose a material or ask us to help.' }
  if (!['own', 'permission', 'unknown', 'noncommercial'].includes(input.rights)) return { error: 'Choose what you know about the design permissions.' }
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 1000) return { error: 'Quantity must be a whole number from 1 to 1,000.' }
  if (!['help', 'original', 'longest'].includes(input.sizeMode) || !['mm', 'cm', 'in'].includes(input.unit)) return { error: 'Choose how to specify the size and its units.' }
  const size = input.sizeMode === 'longest' ? Number(input.size) : null
  const sizeMm = size === null ? null : size * ({ mm: 1, cm: 10, in: 25.4 }[input.unit])
  if (size !== null && (!(size > 0) || !Number.isFinite(sizeMm) || sizeMm > 10000)) return { error: 'Enter a positive longest side no larger than 10,000 mm; FIT will check printer fit.' }
  const sourceUrl = input.sourceUrl ? publicReference(input.sourceUrl) : ''
  if (sourceUrl === null) return { error: 'Use a public HTTPS model reference without login details.' }
  return { value: { version: 1, purpose, category: input.category, sourceUrl, sizeMode: input.sizeMode, size, unit: input.unit, sizeMm, quantity: input.quantity, material: input.material, colour, rights: input.rights, permissionNote, notes } }
}
export function guidedSummary(brief) {
  if (!brief) return []
  return [['Purpose', brief.purpose], ['Category', brief.category], ['Design reference', brief.sourceUrl || 'Help finding a model'], ['Quantity', String(brief.quantity)], ['Size', brief.sizeMode === 'longest' ? `${brief.size} ${brief.unit} longest side (${Number(brief.sizeMm.toFixed(2))} mm)` : brief.sizeMode === 'original' ? 'Original file size — units to be checked' : 'Help choosing a size'], ['Material preference', brief.material === 'help' ? 'Help me choose' : brief.material.toUpperCase()], ['Colour preference', brief.colour], ['Design permissions', brief.rights], ['Permission details', brief.permissionNote], ['Remarks', brief.notes]].filter(([,value]) => value)
}
export function guidedPaymentIssue(request) {
  if (!request?.guidedBrief?.version) return null
  const review = request.guidedReview
  return review?.status === 'approved' && review.fingerprint === request.guidedFingerprint && review.exactFile?.trim() && review.licenceEvidence?.trim() && review.reviewedBy && review.scopeConfirmed === true
    ? null : 'FIT must verify the exact file, paid-print permission, size, quantity and material before quoting or payment.'
}
