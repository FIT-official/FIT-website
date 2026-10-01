export const COMMUNITY_POLICY = Object.freeze({
  version: 'fit-community-v1-review',
  immediatePublication: true,
  negativeRatingMaximum: 2,
  repeatConfirmedAbuseThreshold: null,
  temporaryRestrictionHours: null,
  // No automatic account punishment is enabled or represented as approved.
})
export const REPORT_REASONS = ['harassment', 'threats', 'spam', 'privacy', 'impersonation', 'other']
export const ABUSE_REASONS = ['harassment', 'threats', 'spam', 'privacy', 'impersonation']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const validOperationId = value => typeof value === 'string' && UUID.test(value)
export function plainText(value, maximum, minimum = 1) {
  if (typeof value !== 'string' || value.length > maximum || value.trim().length < minimum ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u200b\u200c\ufeff\u202a-\u202e\u2066-\u2069]/.test(value) ||
    /<\s*\/?\s*[a-z][^>]*>/i.test(value)) return null
  return value.trim()
}
export function containsContactDetails(text) {
  return /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text) ||
    /(?:\+?\d[\d ()-]{6,}\d)/.test(text) ||
    /\b[STFGM]\d{7}[A-Z]\b/i.test(text) || /\b(?:sk_live|sk_test|ghp|github_pat)_[a-zA-Z0-9_]{12,}\b/.test(text)
}
export function classifyContent(body, rating) {
  const flags = []
  if ((Number.isInteger(rating) && rating <= COMMUNITY_POLICY.negativeRatingMaximum) ||
    /\b(disappoint(?:ed|ing)?|poor|bad service|not satisfied|did not work|does not work|faulty)\b/i.test(body)) flags.push('negative_feedback')
  if (/\b(fuck(?:ing)?|idiot|kill you|hate you)\b/i.test(body)) flags.push('potential_abuse')
  if ((body.match(/https?:\/\//gi) || []).length > 2 || /(.)\1{24,}/u.test(body)) flags.push('potential_spam')
  return flags
}
export function validateEntry(body) {
  const allowed = ['clientRequestId', 'kind', 'subject', 'displayName', 'body', 'rating', 'orderType', 'orderId', 'parentId']
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(key => !allowed.includes(key))) return { error: 'Unsupported comment or review fields.' }
  if (!validOperationId(body.clientRequestId)) return { error: 'A valid submission reference is required.' }
  if (!['blog_comment', 'shop_review', 'shop_reply'].includes(body.kind)) return { error: 'Choose a supported comment or review.' }
  if (typeof body.subject !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(body.subject)) return { error: 'Choose a valid article or shop.' }
  const name = plainText(body.displayName, 50, 2), text = plainText(body.body, 1500, 3)
  if (!name || !text) return { error: 'Use a public name (2–50 characters) and plain text (3–1,500 characters).' }
  if (/\b(?:fit|fix it today)\s*(?:admin|official|support|team)\b/i.test(name)) return { error: 'Choose a display name that does not claim to represent FIT.' }
  if (containsContactDetails(name + ' ' + text)) return { error: 'Remove contact details, personal IDs and private access keys before posting publicly.' }
  if (body.kind === 'shop_review' && (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5 ||
    !['print_request', 'fabrication_request'].includes(body.orderType) || typeof body.orderId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.orderId))) return { error: 'Choose a completed request and a rating from 1 to 5.' }
  if (body.kind === 'shop_reply' && !validOperationId(body.parentId)) return { error: 'Choose the review you are responding to.' }
  return { value: { clientRequestId: body.clientRequestId.toLowerCase(), kind: body.kind, subject: body.subject,
    publicName: name, body: text, rating: body.kind === 'shop_review' ? body.rating : null,
    orderType: body.kind === 'shop_review' ? body.orderType : null, orderId: body.kind === 'shop_review' ? body.orderId : null,
    replyTo: body.kind === 'shop_reply' ? body.parentId.toLowerCase() : null } }
}
export function completedOrderEligibility(record, actor, shop, kind) {
  if (!record || !actor || actor === shop || record.creatorUserId !== shop) return false
  return kind === 'print_request' ? record.userId === actor && record.status === 'delivered'
    : kind === 'fabrication_request' && record.customerUserId === actor && record.status === 'completed'
}
export function publicEntry(record) {
  return { entryId: record.entryId, kind: record.kind, displayName: record.publicName, body: record.body,
    rating: record.kind === 'shop_review' ? record.rating : null, completedRequestLinked: record.kind === 'shop_review' && Boolean(record.verifiedOrderKey),
    replyTo: record.kind === 'shop_reply' ? record.replyTo : null, createdAt: record.createdAt }
}
export function validateModeration(body) {
  const allowed = ['operationId', 'expectedRevision', 'action', 'reason', 'abuseReason']
  if (!body || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) ||
    !validOperationId(body.operationId) || !Number.isInteger(body.expectedRevision) || body.expectedRevision < 0 ||
    !['hide', 'restore', 'confirm_abuse', 'clear_abuse', 'mark_reviewed'].includes(body.action) || !plainText(body.reason, 500, 5)) return { error: 'Choose an action, explain the reason and refresh the item before retrying.' }
  if (body.action === 'confirm_abuse' && !ABUSE_REASONS.includes(body.abuseReason)) return { error: 'Select a substantiated abuse reason. Criticism or a low rating is not abuse.' }
  return { value: { operationId: body.operationId.toLowerCase(), expectedRevision: body.expectedRevision, action: body.action,
    reason: body.reason.trim(), abuseReason: body.action === 'confirm_abuse' ? body.abuseReason : null } }
}
