// Integration-style tests for the newsletter HTTP edges: cron auth, admin-send
// gating, the token-authenticated subscriber endpoints, and the two tracking
// endpoints (including the open-redirect clamp on the click tracker).
// Convention: mock Clerk/Mongoose/dispatch at the edges.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({ auth }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: vi.fn() }))
vi.mock('@/lib/newsletter/dispatch', () => ({
    dispatchDueCampaigns: vi.fn(),
    dispatchWelcomeDrip: vi.fn(),
}))
vi.mock('@/models/NewsletterCampaign', () => ({
    default: {
        findOneAndUpdate: vi.fn(),
        find: vi.fn(),
        findById: vi.fn(),
        create: vi.fn(),
        deleteOne: vi.fn(),
    },
}))
vi.mock('@/models/NewsletterEvent', () => ({ default: { create: vi.fn(), aggregate: vi.fn() } }))
vi.mock('@/models/Subscriber', () => ({
    default: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), create: vi.fn() },
}))
vi.mock('@/models/Interest', () => ({ default: { find: vi.fn() } }))

import { POST as subscribePost } from '@/app/api/subscribe/route'
import { GET as cronGet } from '@/app/api/cron/newsletters/route'
import {
    GET as campaignsGet,
    POST as campaignsPost,
    DELETE as campaignsDelete,
} from '@/app/api/admin/newsletter/route'
import { POST as sendPost } from '@/app/api/admin/newsletter/[id]/send/route'
import { POST as unsubscribePost } from '@/app/api/newsletter/unsubscribe/[token]/route'
import { GET as clickGet } from '@/app/api/newsletter/click/route'
import { GET as openGet } from '@/app/api/newsletter/open/route'
import { PUT as prefsPut } from '@/app/api/newsletter/preferences/[token]/route'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { dispatchDueCampaigns, dispatchWelcomeDrip } from '@/lib/newsletter/dispatch'
import NewsletterCampaign from '@/models/NewsletterCampaign'
import NewsletterEvent from '@/models/NewsletterEvent'
import Subscriber from '@/models/Subscriber'

const CAMPAIGN_ID = '68a1b2c3d4e5f6a7b8c9d0e1'
const ORIGIN = 'https://www.example-shop.com'
const envBefore = { ...process.env }

const req = (url, headers = {}) => new Request(url, { headers })
const jsonReq = (url, body) =>
    new Request(url, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })

beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_BASE_URL = ORIGIN
    process.env.CRON_SECRET = 'cron-secret'
    auth.mockResolvedValue({ userId: 'user_1' })
    NewsletterEvent.create.mockResolvedValue({})
    dispatchDueCampaigns.mockResolvedValue([])
    dispatchWelcomeDrip.mockResolvedValue({ sent: 0 })
})

afterAll(() => {
    process.env = envBefore
})

describe('POST /api/subscribe', () => {
    const signup = (body, headers = {}) =>
        subscribePost(
            new Request('https://x/api/subscribe', {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...headers },
                body: JSON.stringify(body),
            }),
        )

    it('normalises the email and upserts with an unsubscribe token seeded on insert', async () => {
        Subscriber.findOneAndUpdate.mockResolvedValue(null) // null pre-doc = created

        const res = await signup({ email: '  Saba@Example.COM ', fullName: 'Saba' })

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true })
        const [filter, update, options] = Subscriber.findOneAndUpdate.mock.calls[0]
        expect(filter).toEqual({ email: 'saba@example.com' })
        expect(update.$set).toMatchObject({ status: 'active', fullName: 'Saba' })
        expect(update.$setOnInsert.unsubscribeToken).toMatch(/^[0-9a-f-]{36}$/)
        expect(options).toMatchObject({ upsert: true, new: false })
    })

    it('re-subscribes a previously unsubscribed address without minting a new token', async () => {
        Subscriber.findOneAndUpdate.mockResolvedValue({
            email: 'a@example.com',
            status: 'unsubscribed',
            unsubscribeToken: 'tok-keep',
        })

        const res = await signup({ email: 'a@example.com' })

        await expect(res.json()).resolves.toMatchObject({ ok: true, resubscribed: true })
        const [, update] = Subscriber.findOneAndUpdate.mock.calls[0]
        expect(update.$set.status).toBe('active')
        // The existing token is only ever seeded on insert, so it survives.
        expect(update.$set.unsubscribeToken).toBeUndefined()
    })

    it('leaves name and interests alone when the signup omits them', async () => {
        Subscriber.findOneAndUpdate.mockResolvedValue({ email: 'a@example.com' })

        await signup({ email: 'a@example.com' })

        const [, update] = Subscriber.findOneAndUpdate.mock.calls[0]
        expect(update.$set).toEqual({ status: 'active' })
    })

    it('rejects a bad email, unknown fields, and an oversized body', async () => {
        const bad = await signup({ email: 'not-an-email' })
        const extra = await signup({ email: 'a@example.com', status: 'active' })
        const huge = await signup({ email: 'a@example.com' }, { 'content-length': '99999' })

        expect(bad.status).toBe(422)
        expect(extra.status).toBe(422)
        expect(huge.status).toBe(413)
        expect(Subscriber.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('treats a duplicate-key race as success rather than a 500', async () => {
        // Two concurrent signups for the same address can still collide on the
        // unique index; the visitor asked to be subscribed, and they are.
        Subscriber.findOneAndUpdate.mockRejectedValue(
            Object.assign(new Error('E11000 duplicate key error'), { code: 11000 }),
        )

        const res = await signup({ email: 'a@example.com' })

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({ ok: true })
    })
})

describe('GET /api/cron/newsletters', () => {
    it('refuses to run at all when CRON_SECRET is unset', async () => {
        delete process.env.CRON_SECRET

        const res = await cronGet(req('https://x/api/cron/newsletters'))

        expect(res.status).toBe(503)
        expect(dispatchDueCampaigns).not.toHaveBeenCalled()
    })

    it('rejects a missing or wrong bearer token', async () => {
        const anon = await cronGet(req('https://x/api/cron/newsletters'))
        const wrong = await cronGet(
            req('https://x/api/cron/newsletters', { authorization: 'Bearer nope' }),
        )

        expect(anon.status).toBe(401)
        expect(wrong.status).toBe(401)
        expect(dispatchDueCampaigns).not.toHaveBeenCalled()
    })

    it('dispatches campaigns and the welcome drip with the right bearer', async () => {
        dispatchDueCampaigns.mockResolvedValue([{ campaignId: CAMPAIGN_ID, sent: 3, failed: 0 }])
        dispatchWelcomeDrip.mockResolvedValue({ sent: 2 })

        const res = await cronGet(
            req('https://x/api/cron/newsletters', { authorization: 'Bearer cron-secret' }),
        )

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            ok: true,
            campaigns: [{ campaignId: CAMPAIGN_ID, sent: 3, failed: 0 }],
            welcome: { sent: 2 },
        })
    })
})

describe('POST /api/admin/newsletter/[id]/send', () => {
    const call = () => sendPost(req('https://x/send'), { params: { id: CAMPAIGN_ID } })

    it('is forbidden for a signed-in non-admin', async () => {
        checkAdminPrivileges.mockResolvedValue(false)

        const res = await call()

        expect(res.status).toBe(403)
        expect(NewsletterCampaign.findOneAndUpdate).not.toHaveBeenCalled()
        expect(dispatchDueCampaigns).not.toHaveBeenCalled()
    })

    it('is unauthorized for an anonymous caller', async () => {
        auth.mockResolvedValue({ userId: null })
        checkAdminPrivileges.mockResolvedValue(false)

        const res = await call()

        expect(res.status).toBe(401)
        expect(checkAdminPrivileges).not.toHaveBeenCalled()
        expect(dispatchDueCampaigns).not.toHaveBeenCalled()
    })

    it('409s instead of re-sending an already-sent campaign', async () => {
        checkAdminPrivileges.mockResolvedValue(true)
        NewsletterCampaign.findOneAndUpdate.mockResolvedValue(null) // claim missed

        const res = await call()

        expect(res.status).toBe(409)
        expect(dispatchDueCampaigns).not.toHaveBeenCalled()
        // The claim only accepts a draft or scheduled campaign.
        const [filter] = NewsletterCampaign.findOneAndUpdate.mock.calls[0]
        expect(filter.status).toEqual({ $in: ['draft', 'scheduled'] })
    })

    it('marks the campaign due and runs the dispatcher inline for an admin', async () => {
        checkAdminPrivileges.mockResolvedValue(true)
        NewsletterCampaign.findOneAndUpdate.mockResolvedValue({ _id: CAMPAIGN_ID })
        dispatchDueCampaigns.mockResolvedValue([{ campaignId: CAMPAIGN_ID, sent: 5, failed: 0 }])

        const res = await call()

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({
            ok: true,
            summary: [{ campaignId: CAMPAIGN_ID, sent: 5 }],
        })
    })
})

describe('/api/admin/newsletter (campaign CRUD)', () => {
    const bodyReq = (body, method = 'POST') =>
        new Request('https://x/api/admin/newsletter', {
            method,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        })

    it('gates every handler behind admin privileges', async () => {
        checkAdminPrivileges.mockResolvedValue(false)

        const list = await campaignsGet(req('https://x/api/admin/newsletter'))
        const write = await campaignsPost(bodyReq({ subject: 'Hi' }))
        const del = await campaignsDelete(bodyReq({ _id: CAMPAIGN_ID }, 'DELETE'))

        expect([list.status, write.status, del.status]).toEqual([403, 403, 403])
        expect(NewsletterCampaign.create).not.toHaveBeenCalled()
        expect(NewsletterCampaign.deleteOne).not.toHaveBeenCalled()
    })

    it('never returns sentTokens in the campaign list (they are unsubscribe credentials)', async () => {
        checkAdminPrivileges.mockResolvedValue(true)
        const select = vi.fn().mockReturnValue({
            sort: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }),
        })
        NewsletterCampaign.find.mockReturnValue({ select })
        NewsletterEvent.aggregate.mockResolvedValue([])

        const res = await campaignsGet(req('https://x/api/admin/newsletter'))

        expect(res.status).toBe(200)
        expect(select).toHaveBeenCalledWith('-sentTokens')
    })

    it('refuses to edit a campaign that has already gone out', async () => {
        checkAdminPrivileges.mockResolvedValue(true)
        NewsletterCampaign.findById.mockResolvedValue({ _id: CAMPAIGN_ID, status: 'sent' })

        const res = await campaignsPost(bodyReq({ _id: CAMPAIGN_ID, subject: 'Rewrite' }))

        expect(res.status).toBe(409)
    })

    it('derives status from scheduledFor and falls back to the "all" audience', async () => {
        checkAdminPrivileges.mockResolvedValue(true)
        NewsletterCampaign.create.mockImplementation(async (d) => d)

        await campaignsPost(bodyReq({ subject: 'Draft one', audience: { type: 'bogus' } }))
        await campaignsPost(
            bodyReq({ subject: 'Timed', scheduledFor: '2026-09-01T10:00:00.000Z' }),
        )

        const [draft] = NewsletterCampaign.create.mock.calls[0]
        const [timed] = NewsletterCampaign.create.mock.calls[1]
        expect(draft).toMatchObject({ status: 'draft', audience: { type: 'all' } })
        expect(timed).toMatchObject({
            status: 'scheduled',
            scheduledFor: new Date('2026-09-01T10:00:00.000Z'),
        })
    })

    it('will not delete a campaign that is mid-send', async () => {
        checkAdminPrivileges.mockResolvedValue(true)
        NewsletterCampaign.deleteOne.mockResolvedValue({ deletedCount: 0 })

        await campaignsDelete(bodyReq({ _id: CAMPAIGN_ID }, 'DELETE'))

        expect(NewsletterCampaign.deleteOne).toHaveBeenCalledWith({
            _id: CAMPAIGN_ID,
            status: { $nin: ['sending'] },
        })
    })
})

describe('POST /api/newsletter/unsubscribe/[token]', () => {
    it('404s on an unknown token without touching anyone', async () => {
        Subscriber.findOneAndUpdate.mockResolvedValue(null)

        const res = await unsubscribePost(req('https://x/unsub', {}), {
            params: { token: 'not-a-token' },
        })

        expect(res.status).toBe(404)
    })

    it('marks exactly the token holder unsubscribed', async () => {
        Subscriber.findOneAndUpdate.mockResolvedValue({ email: 'a@example.com' })

        const res = await unsubscribePost(req('https://x/unsub', {}), {
            params: { token: 'tok-a' },
        })

        expect(res.status).toBe(200)
        expect(Subscriber.findOneAndUpdate).toHaveBeenCalledWith(
            { unsubscribeToken: 'tok-a' },
            { status: 'unsubscribed' },
        )
    })
})

describe('GET /api/newsletter/click', () => {
    it('redirects to a same-origin target and records the click', async () => {
        const res = await clickGet(
            req(`https://x/api/newsletter/click?c=${CAMPAIGN_ID}&s=tok-a&url=/blog/my-post`),
        )

        expect(res.status).toBe(302)
        expect(res.headers.get('location')).toBe(`${ORIGIN}/blog/my-post`)
        expect(NewsletterEvent.create).toHaveBeenCalledWith({
            campaignId: CAMPAIGN_ID,
            subscriberToken: 'tok-a',
            type: 'click',
            url: '/blog/my-post',
        })
    })

    it('refuses to be an open redirect: a foreign target falls back to our origin', async () => {
        const evil = await clickGet(
            req(`https://x/api/newsletter/click?c=${CAMPAIGN_ID}&s=tok-a&url=https://evil.test/steal`),
        )
        const protocolRelative = await clickGet(
            req(`https://x/api/newsletter/click?c=${CAMPAIGN_ID}&s=tok-a&url=//evil.test/steal`),
        )

        expect(evil.headers.get('location')).toBe(`${ORIGIN}/`)
        expect(protocolRelative.headers.get('location')).toBe(`${ORIGIN}/`)
    })

    it('still redirects when tracking is unusable, and records nothing', async () => {
        const noIds = await clickGet(req('https://x/api/newsletter/click?url=/shop'))
        const badId = await clickGet(req('https://x/api/newsletter/click?c=nope&s=tok-a&url=/shop'))

        expect(noIds.headers.get('location')).toBe(`${ORIGIN}/shop`)
        expect(badId.headers.get('location')).toBe(`${ORIGIN}/shop`)
        expect(NewsletterEvent.create).not.toHaveBeenCalled()
    })

    it('a tracking write failure never breaks the redirect', async () => {
        NewsletterEvent.create.mockRejectedValue(new Error('mongo down'))

        const res = await clickGet(
            req(`https://x/api/newsletter/click?c=${CAMPAIGN_ID}&s=tok-a&url=/shop`),
        )

        expect(res.status).toBe(302)
        expect(res.headers.get('location')).toBe(`${ORIGIN}/shop`)
    })
})

describe('GET /api/newsletter/open', () => {
    it('returns an uncacheable 1x1 gif and records the open', async () => {
        const res = await openGet(req(`https://x/api/newsletter/open?c=${CAMPAIGN_ID}&s=tok-a`))

        expect(res.headers.get('content-type')).toBe('image/gif')
        expect(res.headers.get('cache-control')).toBe('no-store')
        expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0)
        expect(NewsletterEvent.create).toHaveBeenCalledWith({
            campaignId: CAMPAIGN_ID,
            subscriberToken: 'tok-a',
            type: 'open',
        })
    })

    it('serves the pixel even when the ids are missing or the write fails', async () => {
        const bare = await openGet(req('https://x/api/newsletter/open'))
        expect(bare.headers.get('content-type')).toBe('image/gif')
        expect(NewsletterEvent.create).not.toHaveBeenCalled()

        NewsletterEvent.create.mockRejectedValue(new Error('mongo down'))
        const broken = await openGet(
            req(`https://x/api/newsletter/open?c=${CAMPAIGN_ID}&s=tok-a`),
        )
        expect(broken.headers.get('content-type')).toBe('image/gif')
    })
})

describe('PUT /api/newsletter/preferences/[token]', () => {
    const doc = () => ({
        email: 'a@example.com',
        status: 'unsubscribed',
        interestIds: [],
        preferences: {},
        save: vi.fn().mockResolvedValue({}),
    })

    it('rejects unknown fields (strict schema) before touching the subscriber', async () => {
        const res = await prefsPut(jsonReq('https://x/prefs', { status: 'active' }), {
            params: { token: 'tok-a' },
        })

        expect(res.status).toBe(422)
        expect(Subscriber.findOne).not.toHaveBeenCalled()
    })

    it('404s on an unknown token', async () => {
        Subscriber.findOne.mockResolvedValue(null)

        const res = await prefsPut(jsonReq('https://x/prefs', { frequency: 'weekly' }), {
            params: { token: 'nope' },
        })

        expect(res.status).toBe(404)
    })

    it('applies interests, frequency, pause and resubscribe', async () => {
        const sub = doc()
        Subscriber.findOne.mockResolvedValue(sub)

        const res = await prefsPut(
            jsonReq('https://x/prefs', {
                interestIds: ['i1', 'i2'],
                frequency: 'monthly',
                pausedUntil: '2026-09-01T00:00:00.000Z',
                resubscribe: true,
            }),
            { params: { token: 'tok-a' } },
        )

        expect(res.status).toBe(200)
        expect(sub.interestIds).toEqual(['i1', 'i2'])
        expect(sub.preferences.frequency).toBe('monthly')
        expect(sub.preferences.pausedUntil).toEqual(new Date('2026-09-01T00:00:00.000Z'))
        expect(sub.status).toBe('active')
        expect(sub.save).toHaveBeenCalled()
    })

    it('clears the pause when pausedUntil is null', async () => {
        const sub = doc()
        sub.preferences.pausedUntil = new Date('2026-09-01T00:00:00.000Z')
        Subscriber.findOne.mockResolvedValue(sub)

        await prefsPut(jsonReq('https://x/prefs', { pausedUntil: null }), {
            params: { token: 'tok-a' },
        })

        expect(sub.preferences.pausedUntil).toBeNull()
    })
})
