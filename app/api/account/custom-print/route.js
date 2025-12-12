import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import CustomPrintRequest from '@/models/CustomPrintRequest'

export async function GET() {
  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await connectToDatabase()

  const docs = await CustomPrintRequest.find({ userId: user.id })
    .sort({ createdAt: -1 })
    .lean()

  return NextResponse.json({ requests: docs })
}
