import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import BlogPost from '@/models/BlogPost'
import { statusWrite } from '@/lib/blog/status'
import { verifyCronSecret } from '@/lib/verifyCronSecret'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/blog-scheduled — publish due scheduled posts (draft +
 * scheduledFor <= now). Auth: `Authorization: Bearer $CRON_SECRET`, same
 * pattern as /api/cron/custom-print-nudges (GitHub Actions scheduler).
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

    await connectToDatabase()
    const now = new Date()
    const due = await BlogPost.find({
        published: { $ne: true },
        scheduledFor: { $ne: null, $lte: now },
    }).limit(100)

    let publishedCount = 0
    for (const post of due) {
        Object.assign(post, statusWrite('published', post.publishDate, now), { scheduledFor: null })
        await post.save()
        publishedCount += 1
    }
    return NextResponse.json({ ok: true, published: publishedCount })
}
