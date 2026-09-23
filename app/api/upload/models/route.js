import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { signModelUpload } from '@/lib/modelUpload'

export const runtime = 'nodejs'

export async function POST(req) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  try {
    const result = await signModelUpload(userId, body, false)
    return NextResponse.json(result, { status: result.error ? 400 : 200 })
  } catch (error) {
    console.error('Model upload signing failed:', error)
    return NextResponse.json({ error: 'Could not prepare the upload' }, { status: 500 })
  }
}
