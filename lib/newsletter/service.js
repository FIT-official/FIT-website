// Per-campaign send loop with resume. Pure-ish: models/transport injected —
// the cron route is the Mongoose/SMTP edge.
import { renderCampaignEmail } from '@/lib/newsletter/template'

/**
 * Send a campaign to an already-resolved audience, skipping subscribers whose
 * token is in `campaign.sentTokens` (resume after a crash/retry).
 * `onSent(subscriber)` is awaited after each successful send — persist the
 * token + event there so a mid-run failure never double-sends.
 */
export async function sendCampaign({ campaign, subscribers, posts, baseUrl, sendEmail, onSent }) {
  const already = new Set(campaign.sentTokens || [])
  let sent = 0
  let failed = 0
  const errors = []
  for (const sub of subscribers) {
    if (already.has(sub.unsubscribeToken)) continue
    try {
      const { html, text } = renderCampaignEmail({ campaign, posts, subscriber: sub, baseUrl })
      await sendEmail({ to: sub.email, subject: campaign.subject, html, text })
      sent += 1
      if (onSent) await onSent(sub)
    } catch (e) {
      failed += 1
      errors.push(`${sub.email}: ${e?.message || e}`)
    }
  }
  return { sent, failed, errors }
}
