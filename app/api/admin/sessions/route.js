import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import CheckoutSession from '@/models/CheckoutSession'

export async function GET(request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Check if user is admin
        const client = await clerkClient()
        const user = await client.users.getUser(userId)

        if (!user || user.publicMetadata.role !== 'admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const status = searchParams.get('status') // 'pending', 'processed', or 'all'
        const processed = searchParams.get('processed') // 'true', 'false', or null

        await connectToDatabase()

        // Build query
        let query = {}
        if (status && status !== 'all') {
            query.status = status
        }
        if (processed !== null) {
            query.processed = processed === 'true'
        }

        const sessions = await CheckoutSession.find(query)
            .sort({ createdAt: -1 })
            .limit(100)

        return NextResponse.json({ sessions })
    } catch (error) {
        console.error('Error fetching sessions:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function PATCH(request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Check if user is admin
        const client = await clerkClient()
        const user = await client.users.getUser(userId)

        if (!user || user.publicMetadata.role !== 'admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
        }

        const { sessionId, processed } = await request.json()

        if (!sessionId || typeof processed !== 'boolean') {
            return NextResponse.json({ error: 'Invalid request data' }, { status: 400 })
        }

        await connectToDatabase()

        const session = await CheckoutSession.findOneAndUpdate(
            { sessionId },
            {
                processed,
                updatedAt: new Date()
            },
            { new: true }
        )

        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 })
        }

        return NextResponse.json({ success: true, session })
    } catch (error) {
        console.error('Error updating session:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}