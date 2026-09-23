import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import CheckoutSession from '@/models/CheckoutSession'
import { checkAdminPrivileges } from '@/lib/checkPrivileges';
import { authenticate, UnauthorizedError, unauthorizedResponse } from '@/lib/authenticate';

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

        // Reviews are fetched separately so ordinary rows cannot crowd them
        // out of the limit, and the old processed flag cannot hide a payment.
        let query = { status: { $ne: 'reconciliation_required' } }
        if (status && status !== 'all') {
            query.status = status
        }
        if (processed !== null) {
            if (!['true', 'false'].includes(processed)) return NextResponse.json({ error: 'Invalid processed filter' }, { status: 400 })
            query.processed = processed === 'true'
        }

        // Add date range filtering
        if (startDate && endDate) {
            if (!Number.isFinite(Date.parse(startDate)) || !Number.isFinite(Date.parse(endDate)) || Date.parse(startDate) > Date.parse(endDate)) {
                return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
            }
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        }

        const [normalSessions, paymentReviews] = await Promise.all([
            status === 'reconciliation_required' ? [] : CheckoutSession.find(query).sort({ createdAt: -1 }).limit(100),
            CheckoutSession.find({ status: 'reconciliation_required', ...(query.createdAt ? { createdAt: query.createdAt } : {}) })
                .sort({ 'reconciliation.recordedAt': -1 }).limit(100),
        ])
        const sessions = [...paymentReviews, ...normalSessions]

        return NextResponse.json({ sessions })
    } catch (error) {
        if (error instanceof UnauthorizedError) return unauthorizedResponse()
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

        if (typeof sessionId !== 'string' || !/^cs_[a-zA-Z0-9_]{1,250}$/.test(sessionId) || typeof processed !== 'boolean') {
            return NextResponse.json({ error: 'Invalid request data' }, { status: 400 })
        }

        await connectToDatabase()

        const session = await CheckoutSession.findOneAndUpdate(
            { sessionId, status: { $ne: 'reconciliation_required' } },
            {
                processed,
                updatedAt: new Date()
            },
            { new: true }
        )

        if (!session) {
            if (await CheckoutSession.exists({ sessionId, status: 'reconciliation_required' })) {
                return NextResponse.json({ error: 'This payment requires reconciliation and cannot be marked processed.' }, { status: 409 })
            }
            return NextResponse.json({ error: 'Session not found' }, { status: 404 })
        }

        return NextResponse.json({ success: true, session })
    } catch (error) {
        if (error instanceof UnauthorizedError) return unauthorizedResponse()
        console.error('Error updating session:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
