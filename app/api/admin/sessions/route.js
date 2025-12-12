import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import CheckoutSession from '@/models/CheckoutSession'
import { checkAdminPrivileges } from '@/lib/checkPrivileges';
import { authenticate } from '@/lib/authenticate';

export async function GET(request) {
    try {
        const { userId } = await authenticate(request);
        const isAdmin = await checkAdminPrivileges(userId);
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { searchParams } = new URL(request.url)
        const status = searchParams.get('status')
        const processed = searchParams.get('processed')
        const startDate = searchParams.get('startDate')
        const endDate = searchParams.get('endDate')

        await connectToDatabase()

        // Build query
        let query = {}
        if (status && status !== 'all') {
            query.status = status
        }
        if (processed !== null) {
            query.processed = processed === 'true'
        }

        // Add date range filtering
        if (startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
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
        const { userId } = await authenticate(request);
        const isAdmin = await checkAdminPrivileges(userId);
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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