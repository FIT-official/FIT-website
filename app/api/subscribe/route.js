import { NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { connectToDatabase } from '@/lib/db'
import Subscriber from '@/models/Subscriber'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 4 * 1024

const SubscribeSchema = z
    .object({
        email: z.string().trim().toLowerCase().email().max(254),
        fullName: z.string().trim().max(120).optional(),
        interestIds: z.array(z.string().max(64)).max(20).optional(),
    })
    .strict()

// Public newsletter signup. Upserts by email; preserves the unsubscribe token;
// re-subscribes a previously-unsubscribed address.
export async function POST(req) {
    const length = Number(req.headers.get('content-length') || 0)
    if (length > MAX_BODY_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }
    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const parsed = SubscribeSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid input' }, { status: 422 })
    }
    const { email, fullName, interestIds } = parsed.data

    await connectToDatabase()
    // One atomic upsert keyed on the unique email: a read-then-write would let
    // two concurrent signups (a double-clicked form) both miss, and the loser
    // would hit the unique index and 500 at the visitor. `new: false` returns
    // the pre-update doc, so null means we just created them.
    try {
        const previous = await Subscriber.findOneAndUpdate(
            { email },
            {
                $set: {
                    status: 'active',
                    ...(fullName ? { fullName } : {}),
                    ...(interestIds ? { interestIds } : {}),
                },
                $setOnInsert: { unsubscribeToken: crypto.randomUUID() },
            },
            { upsert: true, new: false },
        )
        return NextResponse.json(previous ? { ok: true, resubscribed: true } : { ok: true })
    } catch (e) {
        // Upsert can still lose a race on the unique index; either way the
        // address is subscribed, which is all the visitor asked for.
        if (e?.code === 11000) return NextResponse.json({ ok: true, resubscribed: true })
        throw e
    }
}
