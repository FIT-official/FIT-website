import { checkedClientRequestId, fail } from '@/lib/fabrication/serverHttp'

export const TOPICS = ['general', '3d-printing', 'cad', 'electronics', 'coding']
export const TOPIC_LABELS = { general: 'General making', '3d-printing': '3D printing', cad: 'CAD & design', electronics: 'Electronics', coding: 'Coding' }
export const REPORT_REASONS = ['spam', 'privacy', 'abuse', 'unsafe', 'other']
export const STATUSES = ['pending', 'approved', 'rejected', 'hidden', 'withdrawn']
export const PAGE_SIZE = 20
export function exactFields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) fail('Check the submitted fields.')
}
export function plainText(value, label, min, max) {
  if (typeof value !== 'string') fail(`Enter ${label}.`)
  const text = value.trim().replace(/\r\n?/g, '\n')
  if (text.length < min || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(text)) fail(`Use ${min}–${max} characters for ${label}, without hidden control characters.`)
  return text
}
export const entryId = value => checkedClientRequestId(value)
export function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100000) fail('Refresh this item before continuing.', 409)
  return value
}
export function contentFields(body, kind) {
  const displayName = plainText(body.displayName, 'a public maker name', 2, 40)
  if (/[\n\r@]|https?:|www\./i.test(displayName)) fail('Use a maker name without contact details or links.')
  const content = { displayName, body: plainText(body.body, 'your message', kind === 'comment' ? 2 : 20, kind === 'comment' ? 2000 : 6000) }
  if (kind !== 'comment') {
    content.title = plainText(body.title, 'a title', 5, 120)
    if (!TOPICS.includes(body.topic)) fail('Choose a topic.')
    content.topic = body.topic
  }
  return content
}
export function newContent(body, kind) {
  const comment = kind === 'comment'
  exactFields(body, ['clientRequestId', 'displayName', 'body', 'guidelinesAccepted', 'website', ...(comment ? [] : ['kind', 'title', 'topic'])])
  if (!comment && !['question', 'project'].includes(body.kind)) fail('Choose a question or project.')
  if (body.guidelinesAccepted !== true || (body.website !== undefined && body.website !== '')) fail('Confirm the community guidelines and try again.')
  return { clientRequestId: entryId(body.clientRequestId), kind: comment ? 'comment' : body.kind, ...contentFields(body, comment ? 'comment' : body.kind) }
}
export function pageFilter(params, base, field = 'createdAt', idField = 'entryId') {
  const cursor = params.get('cursor')
  if (!cursor) return base
  if (cursor.length > 90) fail('Invalid page cursor.')
  const [time, id, extra] = cursor.split('|')
  if (extra !== undefined || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(time || '') || !Number.isFinite(Date.parse(time)) || new Date(time).toISOString() !== time) fail('Invalid page cursor.')
  entryId(id)
  return { ...base, $or: [{ [field]: { $lt: new Date(time) } }, { [field]: new Date(time), [idField]: { $lt: id } }] }
}
export function pageResult(rows, shape, field = 'createdAt', idField = 'entryId') {
  const items = rows.slice(0, PAGE_SIZE), last = items.at(-1)
  return { items: items.map(shape), nextCursor: rows.length > PAGE_SIZE ? `${new Date(last[field]).toISOString()}|${last[idField]}` : null }
}
