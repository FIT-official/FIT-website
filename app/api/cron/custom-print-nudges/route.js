import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import { sendEmail } from '@/lib/email'
import { buildIdleNudgeEmail } from '@/lib/email/templates/customPrint'
import {
  selectIdleRequests,
  NUDGE_ELIGIBLE_STATUSES,
} from '@/lib/notifications/idleRequests'
import { verifyCronSecret } from '@/lib/verifyCronSecret'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Tunable via env; sensible defaults. Idle = no activity for N days; cooldown
// prevents re-nudging the same request within M days.
const IDLE_DAYS = Number(process.env.CUSTOM_PRINT_NUDGE_IDLE_DAYS) || 3
const COOLDOWN_DAYS = Number(process.env.CUSTOM_PRINT_NUDGE_COOLDOWN_DAYS) || 7
const MAX_PER_RUN = 200

/**
 * GET /api/cron/custom-print-nudges — scheduled job (GitHub Actions,
 * `.github/workflows/custom-print-nudges.yml`) that emails a gentle reminder to
 * customers whose custom-print request has sat idle in a pre-payment state.
 * Auth: requires `Authorization: Bearer $CRON_SECRET`. Returns a summary.
 *
 * The selection rule is pure (`selectIdleRequests`); this route is the
 * side-effecty edge: query candidates → send → stamp `idleNudgeSentAt`.
 */
export async function GET(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron:nudges] CRON_SECRET unset — refusing to run')
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }
  const auth = req.headers.get('authorization') || ''
  if (!verifyCronSecret(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await connectToDatabase()

  const now = Date.now()
  const idleBefore = new Date(now - IDLE_DAYS * 24 * 60 * 60 * 1000)

  // Narrow at the DB level (status + idle by updatedAt), then apply the pure
  // cooldown/eligibility rule for the authoritative decision.
  const candidates = await CustomPrintRequest.find({
    status: { $in: NUDGE_ELIGIBLE_STATUSES },
    updatedAt: { $lte: idleBefore },
  })
    .sort({ updatedAt: 1 })
    .limit(MAX_PER_RUN)
    .lean()

  const due = selectIdleRequests(candidates, {
    now,
    idleDays: IDLE_DAYS,
    cooldownDays: COOLDOWN_DAYS,
  })

  let sent = 0
  let failed = 0
  for (const request of due) {
    try {
      const { subject, html } = buildIdleNudgeEmail({ request })
      await sendEmail({ to: request.userEmail, subject, html })
      await CustomPrintRequest.updateOne(
        { requestId: request.requestId },
        { $set: { idleNudgeSentAt: new Date() } },
      )
      sent += 1
    } catch (err) {
      failed += 1
      console.error(`[cron:nudges] failed for ${request.requestId}:`, err)
    }
  }

  return NextResponse.json({
    scanned: candidates.length,
    due: due.length,
    sent,
    failed,
  })
}
