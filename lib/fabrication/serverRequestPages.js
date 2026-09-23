import { checkedId, fail } from './serverHttp'

export const nextRequestCursor = row => Buffer.from(JSON.stringify([new Date(row.createdAt).toISOString(), row.requestId])).toString('base64url')

export function requestPageOptions(url) {
  const params = new URL(url).searchParams
  const role = params.get('role') || 'customer'
  if (!['provider', 'customer'].includes(role)) fail('Choose provider or customer requests.')
  const supplied = params.get('limit')
  const limit = supplied == null ? 20 : Number(supplied)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail('Page size must be between 1 and 100.')
  let olderThan = {}
  const cursor = params.get('cursor')
  if (cursor) {
    let values
    try {
      if (cursor.length > 320 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error()
      values = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    } catch { fail('Invalid request page cursor.') }
    if (!Array.isArray(values) || values.length !== 2 || typeof values[0] !== 'string') fail('Invalid request page cursor.')
    const createdAt = new Date(values[0])
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== values[0]) fail('Invalid request page cursor.')
    const requestId = checkedId(values[1], 'request page cursor')
    olderThan = { $or: [{ createdAt: { $lt: createdAt } }, { createdAt, requestId: { $lt: requestId } }] }
  }
  return { role, limit, olderThan }
}
