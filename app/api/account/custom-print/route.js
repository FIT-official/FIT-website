import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import { withCreatorDisplayNames } from '@/lib/creatorPrintService/creatorNames'

export async function GET() {
  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await connectToDatabase()

  const docs = await CustomPrintRequest.find({ userId: user.id })
    .sort({ createdAt: -1 })
    .lean()

  // "Handled by <creator>" for creator-routed jobs (best effort: names only).
  let requests = docs
  try {
    requests = await withCreatorDisplayNames(docs)
  } catch (err) {
    console.error('[GET /api/account/custom-print] creator names failed:', err)
  }

  return NextResponse.json({ requests })
}
