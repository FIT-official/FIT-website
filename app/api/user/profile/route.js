import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import User from '@/models/User'
import { isPlanningArea } from '@/lib/location/sgAreas'
import { pickAddressFields } from '@/lib/checkoutAddressGate'

export const dynamic = 'force-dynamic'

// Own profile only (prefill + the optional account "Area"). Area/address are stored server-side in the Mongo user
// profile, never in Clerk publicMetadata, and are only ever returned to the account owner or FIT admin tools.
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await connectToDatabase()
    const [doc, clerkUser] = await Promise.all([
      User.findOne({ userId }, { contact: 1, profile: 1, _id: 0 }).lean(),
      clerkClient().then(c => c.users.getUser(userId)).catch(() => null),
    ])
    const phone = doc?.contact?.phone?.number ? `${doc.contact.phone.countryCode || ''} ${doc.contact.phone.number}`.trim() : clerkUser?.phoneNumbers?.[0]?.phoneNumber || ''
    const profile = {
      name: clerkUser ? `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() : '',
      email: clerkUser?.primaryEmailAddress?.emailAddress || clerkUser?.emailAddresses?.[0]?.emailAddress || '',
      phone, area: doc?.profile?.area || '', address: doc?.contact?.address ? pickAddressFields(doc.contact.address) : null,
    }
    return NextResponse.json({ profile }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('GET /api/user/profile error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    let body
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
    const area = typeof body?.area === 'string' ? body.area.trim() : null
    if (area === null || (area && !isPlanningArea(area))) return NextResponse.json({ error: 'Choose an area from the list, or leave it blank.' }, { status: 400 })
    await connectToDatabase()
    await User.updateOne({ userId }, area ? { $set: { 'profile.area': area } } : { $unset: { 'profile.area': '' } }, { upsert: Boolean(area) })
    return NextResponse.json({ area }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('POST /api/user/profile error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}