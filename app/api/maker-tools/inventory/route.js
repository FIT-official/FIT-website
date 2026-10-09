import { NextResponse } from 'next/server'
import { authenticate, UnauthorizedError } from '@/lib/authenticate'
import { readJson } from '@/lib/fabrication/serverHttp'
import { validateInventory } from '@/lib/makerTools/calculations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (body, status = 200) => NextResponse.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', Vary: 'Cookie, Authorization',
} })
const failure = error => json({ error: error instanceof UnauthorizedError ? 'Sign in to use your private inventory.' :
  error.status && error.status < 500 ? error.message : 'Inventory is temporarily unavailable. Your edits have not been confirmed.' },
error instanceof UnauthorizedError ? 401 : error.status && error.status < 500 ? error.status : 503)
let databaseModule
async function collection() {
  // Share a single lazy import across concurrent authenticated requests.
  databaseModule ||= import('@/lib/db').catch(error => { databaseModule = null; throw error })
  const { connectToDatabase } = await databaseModule
  return (await connectToDatabase()).connection.db.collection('makerInventories')
}
const publicInventory = doc => ({ revision: doc?.revision || 0, spools: doc?.spools || [] })

export async function GET(request) {
  try {
    const { userId } = await authenticate(request)
    const store = await collection()
    // Ownership is always the server session, never a URL/query/body ID.
    return json(publicInventory(await store.findOne({ _id: userId }, { projection: { spools: 1, revision: 1 } })))
  } catch (error) { return failure(error) }
}
export async function PUT(request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Open Maker Tools on this website.' }, 403)
    const { userId } = await authenticate(request)
    const input = validateInventory(await readJson(request, 65536))
    const store = await collection()
    // Unique Mongo _id scopes the record to one user. Revision filter prevents
    // stale tabs and concurrent first saves from overwriting one another.
    let doc
    try {
      doc = await store.findOneAndUpdate({ _id: userId, revision: input.revision },
        { $set: { spools: input.spools, updatedAt: new Date() }, $inc: { revision: 1 } },
        { upsert: input.revision === 0, returnDocument: 'after' })
    } catch (error) {
      if (error.code !== 11000) throw error
    }
    if (!doc) return json({ error: 'Your saved inventory changed in another tab. Export these edits, then reload the saved inventory.', code: 'inventory_conflict' }, 409)
    return json(publicInventory(doc))
  } catch (error) { return failure(error) }
}
