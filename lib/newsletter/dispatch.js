// Side-effecty dispatch edge (Mongoose + gmail transport). The send loop and
// selection rules are pure and unit-tested (service.js, audience.js, welcome.js).
import NewsletterCampaign from '@/models/NewsletterCampaign'
import NewsletterEvent from '@/models/NewsletterEvent'
import Subscriber from '@/models/Subscriber'
import WelcomeSequence from '@/models/WelcomeSequence'
import BlogPost from '@/models/BlogPost'
import { statusQuery } from '@/lib/blog/status'
import { sendEmail } from '@/lib/email'
import { resolveAudience } from '@/lib/newsletter/audience'
import { sendCampaign } from '@/lib/newsletter/service'
import { dueWelcomeStep } from '@/lib/newsletter/welcome'
import { renderWelcomeEmail } from '@/lib/newsletter/template'
import { getPostHogClient } from '@/lib/posthog-server'

const STALE_LOCK_MS = 15 * 60 * 1000
const WELCOME_MAX_PER_RUN = 200

export function newsletterBaseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL || 'https://www.fixitoday.com'
}

/** Claim and send every due campaign. Safe to call concurrently (atomic claim). */
export async function dispatchDueCampaigns(now = new Date()) {
  const summary = []
  // Claim one at a time so two cron runs never double-send.
  for (; ;) {
    const campaign = await NewsletterCampaign.findOneAndUpdate(
      {
        $or: [
          { status: 'scheduled', scheduledFor: { $lte: now } },
          // resume a crashed run
          { status: 'sending', dispatchLockAt: { $lt: new Date(now.getTime() - STALE_LOCK_MS) } },
        ],
      },
      { status: 'sending', dispatchLockAt: now },
      { new: true },
    )
    if (!campaign) break

    const subscribers = await Subscriber.find({ status: 'active' }).lean()
    const audience = resolveAudience(subscribers, campaign, now)
    const posts = await BlogPost.find({ _id: { $in: campaign.articleIds || [] }, ...statusQuery('published') })
      .select('title slug excerpt heroImage')
      .lean()

    const result = await sendCampaign({
      campaign,
      subscribers: audience,
      posts,
      baseUrl: newsletterBaseUrl(),
      sendEmail,
      onSent: async (sub) => {
        await NewsletterCampaign.updateOne(
          { _id: campaign._id },
          { $push: { sentTokens: sub.unsubscribeToken }, $inc: { 'counts.sent': 1 } },
        )
        await NewsletterEvent.create({
          campaignId: campaign._id,
          subscriberToken: sub.unsubscribeToken,
          type: 'sent',
        })
      },
    })

    await NewsletterCampaign.updateOne(
      { _id: campaign._id },
      {
        status: result.sent === 0 && result.failed > 0 ? 'failed' : 'sent',
        sentAt: now,
        $inc: { 'counts.failed': result.failed },
        lastError: result.errors[0] || '',
      },
    )
    try {
      // Cron context — no user session; attribute to a stable system id.
      getPostHogClient().capture({
        distinctId: 'system:newsletter-dispatch',
        event: 'newsletter_campaign_sent',
        properties: {
          campaign_id: String(campaign._id),
          audience_type: campaign.audience?.type || 'all',
          sent: result.sent,
          failed: result.failed,
        },
      })
    } catch (phErr) {
      console.error('PostHog newsletter_campaign_sent capture failed:', phErr)
    }
    summary.push({ campaignId: String(campaign._id), ...result, errors: undefined })
  }
  return summary
}

/** Advance the welcome drip for subscribers with a due step. */
export async function dispatchWelcomeDrip(now = new Date()) {
  const sequence = await WelcomeSequence.findById('welcome-sequence').lean()
  if (!sequence?.isActive || !sequence.steps?.length) return { sent: 0 }

  const candidates = await Subscriber.find({
    status: 'active',
    welcomeStep: { $lt: sequence.steps.length },
  })
    .limit(WELCOME_MAX_PER_RUN)
    .lean()

  let sent = 0
  for (const sub of candidates) {
    const due = dueWelcomeStep(sub, sequence, now)
    if (!due) continue
    try {
      const { html } = renderWelcomeEmail({ step: due.step, subscriber: sub, baseUrl: newsletterBaseUrl() })
      await sendEmail({ to: sub.email, subject: due.step.subject, html })
      await Subscriber.updateOne(
        { _id: sub._id, welcomeStep: due.stepIndex }, // guard against concurrent runs
        { welcomeStep: due.stepIndex + 1, welcomeStepSentAt: now },
      )
      sent += 1
    } catch (e) {
      console.error('[newsletter:welcome] send failed:', sub.email, e?.message || e)
    }
  }
  return { sent }
}
