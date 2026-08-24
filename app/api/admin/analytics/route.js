import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/authenticate'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { unauthorizedResponse } from '@/lib/authenticate'
import { getAnalyticsSnapshot, isConfigured } from '@/lib/analytics/posthog'
import { RANGE_PRESETS } from '@/lib/analytics/aggregate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/admin/analytics?window=last_7_days — PostHog-backed snapshot for
// the admin dashboard. { configured: false } when env keys are absent.
export async function GET(req) {
    let userId
    try {
        ({ userId } = await authenticate(req))
    } catch {
        return unauthorizedResponse()
    }
    if (!(await checkAdminPrivileges(userId))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!isConfigured()) {
        return NextResponse.json({ configured: false })
    }
    const url = new URL(req.url)
    const requested = url.searchParams.get('window')
    const window = RANGE_PRESETS.includes(requested) ? requested : 'last_7_days'
    try {
        const snapshot = await getAnalyticsSnapshot(window)
        return NextResponse.json({ configured: true, snapshot })
    } catch (e) {
        console.error('Analytics snapshot failed:', e?.message || e)
        return NextResponse.json({ error: 'Analytics fetch failed' }, { status: 502 })
    }
}
