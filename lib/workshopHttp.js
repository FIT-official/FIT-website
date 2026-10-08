import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import { UnauthorizedError } from '@/lib/authenticate'
export const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Vary': 'Cookie' }
export const classDb = async () => (await connectToDatabase()).connection.db
export function sameOrigin(request) { if (request.headers.get('origin') !== new URL(request.url).origin) throw Object.assign(Error('Open the class on this website.'), { status: 403 }) }
export async function jsonBody(request, limit = 12000) {
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw Object.assign(Error('Use JSON.'), { status: 415 })
    if (Number(request.headers.get('content-length')) > limit) throw Object.assign(Error('Request too large.'), { status: 413 })
    const body = await request.text()
    if (new TextEncoder().encode(body).length > limit) throw Object.assign(Error('Request too large.'), { status: 413 })
    try { return JSON.parse(body) } catch { throw Object.assign(Error('Invalid request.'), { status: 400 }) }
}
export const classJson = (value, status = 200) => NextResponse.json(value, { status, headers: privateHeaders })
export function classFailure(error) {
    if (error instanceof UnauthorizedError) return classJson({ error: 'Class login required.' }, 401)
    return classJson({ error: error.status ? error.message : 'Class service unavailable. Your draft is kept; please retry.' }, error.status || 503)
}
export async function limitClassOperation(db, key, limit = 30, now = Date.now()) {
    const bucket = Math.floor(now / 60000), store = db.collection('workshopRateLimits'), id = key + ':' + bucket
    try { await store.updateOne({ _id: id }, { $setOnInsert: { count: 0, expiresAt: new Date((bucket + 2) * 60000) } }, { upsert: true }) }
    catch (error) { if (error.code !== 11000) throw error }
    const result = await store.updateOne({ _id: id, count: { $lt: limit } }, { $inc: { count: 1 } })
    if (!result.modifiedCount) throw Object.assign(Error('Please wait a minute before trying again.'), { status: 429 })
}
