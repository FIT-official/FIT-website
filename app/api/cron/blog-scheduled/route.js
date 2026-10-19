import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import BlogPost from '@/models/BlogPost'
import { statusWrite, statusQuery } from '@/lib/blog/status'
import { verifyCronSecret } from '@/lib/verifyCronSecret'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Log-safe error text: driver errors can embed the connection string.
const safeMessage = error => String(error?.message || error).replace(/mongodb(\+srv)?:\/\/\S+/gi, '[redacted-uri]').slice(0, 300)

/**
 * GET /api/cron/blog-scheduled — publish due scheduled posts (draft +
 * scheduledFor <= now). Auth: `Authorization: Bearer $CRON_SECRET`, same
 * pattern as /api/cron/custom-print-nudges (GitHub Actions scheduler).
 *
 * Failure contract. Context: GitHub Actions run #1481 (18 Oct 2026 16:38 UTC) got
 * a bare HTTP 500 from this endpoint while the neighbouring runs on the same
 * deploy succeeded. The production function log (read-only, 19 Oct 2026) shows
 * two invocations of this route at 16:38:28Z and 16:38:33Z failing with
 * `MongoWaitQueueTimeoutError: Timed out while checking out a connection from
 * connection pool`, and /sitemap.xml hitting the same error a minute earlier on
 * the same deployment. That is the verified PROXIMATE error; WHY the pool was
 * exhausted at that moment is not known. Before this change the handler had no
 * try/catch, so that throw became an opaque 500; it now becomes a retryable 503
 * with a redacted log line.
 *  - database unreachable  -> 503 { ok: false, retryable: true }  (scheduler retries)
 *  - one post fails to save -> that post is reported in `failed`, the rest still
 *    publish, and the response is 207 with ok:false (never reported as success);
 *    the next tick retries only what is still due.
 * No secret or connection string is ever echoed in the body.
 */
export async function GET(req) {
    const secret = process.env.CRON_SECRET
    if (!secret) {
        console.error('[cron:blog] CRON_SECRET unset — refusing to run')
        return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }
    const auth = req.headers.get('authorization') || ''
    if (!verifyCronSecret(auth, `Bearer ${secret}`)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    let due
    try {
        await connectToDatabase()
        due = await BlogPost.find({
            ...statusQuery('draft'),
            scheduledFor: { $ne: null, $lte: now },
        }).limit(100)
    } catch (error) {
        console.error('[cron:blog] database unavailable:', safeMessage(error))
        return NextResponse.json({ ok: false, retryable: true, error: 'Database unavailable' }, { status: 503 })
    }

    // Guarded status flip (compare-and-set): each post is flipped with an updateOne whose filter re-checks the
    // due-draft state, so a retried request, the next tick, or a second scheduler (for example another repository's
    // workflow, if its CRON_BASE_URL points at this app; that is not known) does not flip the same post again or re-stamp publishDate. This relies on MongoDB's single-document
    // atomicity for updateOne; it has been exercised only through mocks here, not against a real deployment, and it
    // is not an end-to-end exactly-once guarantee for anything downstream that reads `published`. A post whose write
    // fails stays a due draft and is retried on the next tick.
    let publishedCount = 0
    let alreadyPublished = 0
    const failed = []
    for (const post of due) {
        try {
            const result = await BlogPost.updateOne(
                { _id: post._id, ...statusQuery('draft'), scheduledFor: { $ne: null, $lte: now } },
                { $set: { ...statusWrite('published', post.publishDate, now), scheduledFor: null } },
            )
            if (result.modifiedCount === 1) publishedCount += 1
            else alreadyPublished += 1 // someone else won the race; nothing to do
        } catch (error) {
            console.error('[cron:blog] failed to publish post', String(post?._id), safeMessage(error))
            failed.push(String(post?._id))
        }
    }
    const body = { ok: failed.length === 0, published: publishedCount, alreadyPublished, failed, checkedAt: now.toISOString() }
    // Partial failure is NOT success: 207 keeps the scheduler from retrying a request that partly applied (the next tick
    // retries only what is still due) while the body's ok:false makes the workflow report it.
    return NextResponse.json(body, { status: failed.length ? 207 : 200 })
}
