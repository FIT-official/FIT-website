import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import { limitQuoteRequest } from '@/lib/rateLimit'
import { loadFarmProfile } from '@/lib/quoting/loadFarmProfile'
import { ESTIMATE_STATUSES, estimateCreatorRequest } from '@/lib/quoting/farmQuote'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OPTION_KEYS = ['postProcessing', 'specialRequest', 'priority', 'expedite']

/**
 * POST /api/custom-print/estimate `{ requestId, options?, deliveryType? }` —
 * the owner of a CREATOR print request asks for the farm's estimate. The
 * stored model is re-measured server-side and priced with the farm profile
 * resolved from the creator's saved service; the result is saved as
 * `request.estimate` for the creator to confirm. It never writes `quote`,
 * never makes the job payable here: payment is arranged directly with the
 * creator. TODO(phase5-connect): creator checkout via Stripe Connect.
 */
export async function POST(req) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: 'Sign in to request an estimate' }, { status: 401 })
        const rate = await limitQuoteRequest({ userId, headers: req.headers })
        if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Please retry shortly.' }, { status: 429, headers: rate.headers })

        let body
        try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
        const requestId = typeof body?.requestId === 'string' ? body.requestId : ''
        if (!requestId || requestId.length > 64) return NextResponse.json({ error: 'requestId is required' }, { status: 400 })
        if (body.deliveryType != null && (typeof body.deliveryType !== 'string' || body.deliveryType.length > 64)) {
            return NextResponse.json({ error: 'Invalid delivery option' }, { status: 400 })
        }
        const options = Object.fromEntries(OPTION_KEYS.map((key) => [key, body.options?.[key] === true]))

        await connectToDatabase()
        const request = await CustomPrintRequest.findOne({ requestId }).lean()
        if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
        if (request.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        if (!request.creatorUserId) {
            return NextResponse.json({ error: 'Fix It Today requests are priced with an instant quote.' }, { status: 409 })
        }
        if (!ESTIMATE_STATUSES.includes(request.status) || request.paidAt || request.stripeSessionId || request.stripePaymentIntentId) {
            return NextResponse.json({ error: 'The print farm has already priced this request.' }, { status: 409 })
        }

        const { service, profile } = await loadFarmProfile(request.creatorUserId)
        if (!profile || !service?.enabled) {
            return NextResponse.json({ error: 'This print service is not taking requests right now.' }, { status: 409 })
        }

        const outcome = await estimateCreatorRequest({ request, profile,
            body: { options, ...(body.deliveryType != null ? { deliveryType: body.deliveryType } : {}) } })
        if (outcome.status !== 200) return NextResponse.json(outcome.body, { status: outcome.status })

        const { estimate, pricedWith } = outcome.body
        const saved = await CustomPrintRequest.findOneAndUpdate(
            // Measurement can outlive a model/settings edit. Apply the same
            // saved-version and payment locks as the chargeable quote path.
            { requestId, userId, creatorUserId: request.creatorUserId, status: request.status,
                paidAt: null, stripeSessionId: null, stripePaymentIntentId: null,
                'modelFile.s3Key': request.modelFile?.s3Key,
                ...(request.updatedAt ? { updatedAt: request.updatedAt } : {}),
                ...(request.printConfiguration?.configuredAt ? { 'printConfiguration.configuredAt': request.printConfiguration.configuredAt } : {}),
            },
            { $set: { estimate, estimatedAt: new Date(), pricedWith } },
            { new: true, runValidators: true },
        )
        if (!saved) {
            return NextResponse.json({ error: 'This request changed while its estimate was being calculated. Reload it before trying again.' }, { status: 409 })
        }
        return NextResponse.json({ estimate, pricedWith, estimateOnly: true }, { headers: rate.headers })
    } catch (error) {
        console.error('Creator estimate failed:', error?.message || 'estimate_error')
        return NextResponse.json({ error: 'The estimate service is temporarily unavailable. Please try again.' }, { status: 503 })
    }
}
