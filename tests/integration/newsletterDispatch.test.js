// Integration-style tests for the newsletter dispatch edge — the part the pure
// unit tests (audience/service/welcome/template) deliberately don't cover: the
// atomic claim, the resume-after-crash path, the failure bookkeeping, and the
// welcome drip's concurrency guard. Convention: mock Mongoose/transport at the
// edges.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/models/NewsletterCampaign', () => ({
    default: { findOneAndUpdate: vi.fn(), updateOne: vi.fn() },
}))
vi.mock('@/models/NewsletterEvent', () => ({ default: { create: vi.fn() } }))
vi.mock('@/models/Subscriber', () => ({ default: { find: vi.fn(), updateOne: vi.fn() } }))
vi.mock('@/models/WelcomeSequence', () => ({ default: { findById: vi.fn() } }))
vi.mock('@/models/BlogPost', () => ({ default: { find: vi.fn() } }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/posthog-server', () => ({ getPostHogClient: () => ({ capture: vi.fn() }) }))

import { dispatchDueCampaigns, dispatchWelcomeDrip } from '@/lib/newsletter/dispatch'
import NewsletterCampaign from '@/models/NewsletterCampaign'
import NewsletterEvent from '@/models/NewsletterEvent'
import Subscriber from '@/models/Subscriber'
import WelcomeSequence from '@/models/WelcomeSequence'
import BlogPost from '@/models/BlogPost'
import { sendEmail } from '@/lib/email'

const NOW = new Date('2026-08-17T10:00:00Z')

const subscriber = (email, token, extra = {}) => ({
    _id: `sub-${token}`,
    email,
    status: 'active',
    unsubscribeToken: token,
    ...extra,
})

const campaign = (extra = {}) => ({
    _id: '68a1b2c3d4e5f6a7b8c9d0e1',
    subject: 'August prints',
    contentHtml: '<p>Hello</p>',
    audience: { type: 'all' },
    articleIds: [],
    sentTokens: [],
    ...extra,
})

// Subscriber.find(...).lean() for campaigns, .limit(...).lean() for the drip.
const subscriberFindReturns = (docs) => {
    const chain = { lean: () => Promise.resolve(docs), limit: () => chain }
    Subscriber.find.mockReturnValue(chain)
}

// One claim, then stop the dispatcher's loop.
const claimsOnce = (doc) => {
    NewsletterCampaign.findOneAndUpdate
        .mockResolvedValueOnce(doc)
        .mockResolvedValue(null)
}

beforeEach(() => {
    vi.clearAllMocks()
    NewsletterCampaign.updateOne.mockResolvedValue({})
    NewsletterEvent.create.mockResolvedValue({})
    Subscriber.updateOne.mockResolvedValue({ modifiedCount: 1 })
    BlogPost.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) })
    sendEmail.mockResolvedValue({})
})

describe('dispatchDueCampaigns', () => {
    it('claims a due campaign, sends to the active audience, and records each send', async () => {
        claimsOnce(campaign())
        subscriberFindReturns([
            subscriber('a@example.com', 'tok-a'),
            subscriber('b@example.com', 'tok-b'),
        ])

        const summary = await dispatchDueCampaigns(NOW)

        expect(sendEmail).toHaveBeenCalledTimes(2)
        expect(summary).toEqual([
            { campaignId: '68a1b2c3d4e5f6a7b8c9d0e1', sent: 2, failed: 0, errors: undefined },
        ])
        // Each success persists the token (resume marker) and a 'sent' event.
        expect(NewsletterEvent.create).toHaveBeenCalledTimes(2)
        expect(NewsletterEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({ subscriberToken: 'tok-a', type: 'sent' }),
        )
        // Final bookkeeping marks it sent.
        expect(NewsletterCampaign.updateOne).toHaveBeenLastCalledWith(
            { _id: '68a1b2c3d4e5f6a7b8c9d0e1' },
            expect.objectContaining({ status: 'sent', sentAt: NOW }),
        )
    })

    it('claims atomically: the claim filter only matches due-scheduled or stale-locked campaigns', async () => {
        claimsOnce(campaign())
        subscriberFindReturns([])

        await dispatchDueCampaigns(NOW)

        const [filter, update] = NewsletterCampaign.findOneAndUpdate.mock.calls[0]
        expect(filter.$or[0]).toEqual({ status: 'scheduled', scheduledFor: { $lte: NOW } })
        // A 'sending' campaign is only reclaimed once its lock is stale (15 min).
        expect(filter.$or[1].status).toBe('sending')
        expect(NOW.getTime() - filter.$or[1].dispatchLockAt.$lt.getTime()).toBe(15 * 60 * 1000)
        expect(update).toEqual({ status: 'sending', dispatchLockAt: NOW })
    })

    it('resuming a crashed run never double-sends to an already-sent token', async () => {
        claimsOnce(campaign({ sentTokens: ['tok-a'] }))
        subscriberFindReturns([
            subscriber('a@example.com', 'tok-a'),
            subscriber('b@example.com', 'tok-b'),
        ])

        const summary = await dispatchDueCampaigns(NOW)

        expect(sendEmail).toHaveBeenCalledTimes(1)
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'b@example.com' }))
        expect(summary[0].sent).toBe(1)
    })

    it('paused and inactive subscribers are excluded from the audience', async () => {
        claimsOnce(campaign())
        subscriberFindReturns([
            subscriber('paused@example.com', 'tok-p', {
                preferences: { pausedUntil: '2026-09-01T00:00:00Z' },
            }),
            subscriber('gone@example.com', 'tok-g', { status: 'unsubscribed' }),
            subscriber('ok@example.com', 'tok-o'),
        ])

        await dispatchDueCampaigns(NOW)

        expect(sendEmail).toHaveBeenCalledTimes(1)
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ok@example.com' }))
    })

    it('marks the campaign failed when every send fails, and keeps the first error', async () => {
        claimsOnce(campaign())
        subscriberFindReturns([subscriber('a@example.com', 'tok-a')])
        sendEmail.mockRejectedValue(new Error('smtp down'))

        const summary = await dispatchDueCampaigns(NOW)

        expect(summary[0]).toMatchObject({ sent: 0, failed: 1 })
        expect(NewsletterCampaign.updateOne).toHaveBeenLastCalledWith(
            { _id: '68a1b2c3d4e5f6a7b8c9d0e1' },
            expect.objectContaining({ status: 'failed', lastError: 'a@example.com: smtp down' }),
        )
        // A failed send must not leave a resume marker behind.
        expect(NewsletterEvent.create).not.toHaveBeenCalled()
    })

    it('a partial failure still counts as sent so the cron does not retry the whole campaign', async () => {
        claimsOnce(campaign())
        subscriberFindReturns([
            subscriber('good@example.com', 'tok-good'),
            subscriber('bad@example.com', 'tok-bad'),
        ])
        sendEmail.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('bounced'))

        const summary = await dispatchDueCampaigns(NOW)

        expect(summary[0]).toMatchObject({ sent: 1, failed: 1 })
        expect(NewsletterCampaign.updateOne).toHaveBeenLastCalledWith(
            { _id: '68a1b2c3d4e5f6a7b8c9d0e1' },
            expect.objectContaining({ status: 'sent' }),
        )
    })

    it('does nothing and returns an empty summary when nothing is due', async () => {
        NewsletterCampaign.findOneAndUpdate.mockResolvedValue(null)

        await expect(dispatchDueCampaigns(NOW)).resolves.toEqual([])
        expect(sendEmail).not.toHaveBeenCalled()
    })
})

describe('dispatchWelcomeDrip', () => {
    const sequence = (extra = {}) => ({
        _id: 'welcome-sequence',
        isActive: true,
        steps: [
            { subject: 'Welcome', bodyText: 'Hi there', delayDays: 0 },
            { subject: 'Day three', bodyText: 'Still here', delayDays: 3 },
        ],
        ...extra,
    })

    const sequenceReturns = (doc) => {
        WelcomeSequence.findById.mockReturnValue({ lean: () => Promise.resolve(doc) })
    }

    it('sends the due step and advances welcomeStep behind a concurrency guard', async () => {
        sequenceReturns(sequence())
        subscriberFindReturns([
            subscriber('new@example.com', 'tok-n', {
                welcomeStep: 0,
                createdAt: '2026-08-17T09:00:00Z',
            }),
        ])

        await expect(dispatchWelcomeDrip(NOW)).resolves.toEqual({ sent: 1 })
        expect(sendEmail).toHaveBeenCalledWith(
            expect.objectContaining({ to: 'new@example.com', subject: 'Welcome' }),
        )
        // The update is guarded on the step we read, so a concurrent run can't
        // advance the same subscriber twice.
        expect(Subscriber.updateOne).toHaveBeenCalledWith(
            { _id: 'sub-tok-n', welcomeStep: 0 },
            { welcomeStep: 1, welcomeStepSentAt: NOW },
        )
    })

    it('holds a later step until its delay has elapsed', async () => {
        sequenceReturns(sequence())
        subscriberFindReturns([
            subscriber('waiting@example.com', 'tok-w', {
                welcomeStep: 1,
                welcomeStepSentAt: '2026-08-16T10:00:00Z', // 1 day ago, step needs 3
            }),
        ])

        await expect(dispatchWelcomeDrip(NOW)).resolves.toEqual({ sent: 0 })
        expect(sendEmail).not.toHaveBeenCalled()
    })

    it('an inactive or empty sequence sends nothing and never queries subscribers', async () => {
        sequenceReturns(sequence({ isActive: false }))

        await expect(dispatchWelcomeDrip(NOW)).resolves.toEqual({ sent: 0 })
        expect(Subscriber.find).not.toHaveBeenCalled()
        expect(sendEmail).not.toHaveBeenCalled()
    })

    it('one failing send does not stop the rest of the drip', async () => {
        sequenceReturns(sequence())
        subscriberFindReturns([
            subscriber('bad@example.com', 'tok-bad', { welcomeStep: 0, createdAt: '2026-08-01T00:00:00Z' }),
            subscriber('good@example.com', 'tok-good', { welcomeStep: 0, createdAt: '2026-08-01T00:00:00Z' }),
        ])
        sendEmail.mockRejectedValueOnce(new Error('smtp down')).mockResolvedValue({})

        await expect(dispatchWelcomeDrip(NOW)).resolves.toEqual({ sent: 1 })
        // The failed subscriber's step is NOT advanced, so the next run retries it.
        expect(Subscriber.updateOne).toHaveBeenCalledTimes(1)
        expect(Subscriber.updateOne).toHaveBeenCalledWith(
            { _id: 'sub-tok-good', welcomeStep: 0 },
            expect.anything(),
        )
    })
})
