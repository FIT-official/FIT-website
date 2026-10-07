import { randomUUID, createHash } from 'node:crypto';
import OrderEmail from '@/models/OrderEmail';
import { sendEmail } from '@/lib/email';

export const MAX_EMAIL_ATTEMPTS = 5;
const LEASE_MS = 5 * 60 * 1000;
export const orderEmailKey = sessionId => `checkout:${sessionId}:buyer-confirmation`;

// The deterministic Mongo _id gives uniqueness without relying on a newly
// provisioned index. Enqueue in the same transaction as the paid order.
export async function enqueueOrderEmail(sessionId, email, session) {
    if (!email.to) return;
    await OrderEmail.updateOne({ _id: orderEmailKey(sessionId) }, { $setOnInsert: {
        ...email, status: 'queued', attempts: 0, nextAttemptAt: new Date(),
    } }, { upsert: true, session });
}

export async function drainOrderEmails({ sessionId, limit = 10, model = OrderEmail, deliver = sendEmail, now = () => new Date() } = {}) {
    const result = { sent: 0, retrying: 0, dead: 0 };
    for (let i = 0; i < Math.min(Math.max(limit, 0), 10); i++) {
        const at = now();
        const scope = sessionId ? { _id: orderEmailKey(sessionId) } : {};
        // A worker crash on its final attempt must also reach dead-letter.
        await model.updateMany({ ...scope, status: 'sending', attempts: { $gte: MAX_EMAIL_ATTEMPTS }, leaseUntil: { $lte: at } },
            { $set: { status: 'dead', lastError: 'Delivery lease expired on final attempt' }, $unset: { leaseToken: '', leaseUntil: '' } });
        const token = randomUUID();
        const job = await model.findOneAndUpdate({ ...scope, attempts: { $lt: MAX_EMAIL_ATTEMPTS }, nextAttemptAt: { $lte: at },
            $or: [{ status: 'queued' }, { status: 'sending', leaseUntil: { $lte: at } }],
        }, { $set: { status: 'sending', leaseToken: token, leaseUntil: new Date(+at + LEASE_MS) }, $inc: { attempts: 1 } },
        { new: true, sort: { nextAttemptAt: 1 } });
        if (!job) break;
        const claim = { _id: job._id, status: 'sending', leaseToken: token };
        try {
            const messageId = `<fit-order-${createHash('sha256').update(job._id).digest('hex')}@fixitoday.com>`;
            await deliver({ to: job.to, subject: job.subject, html: job.html, messageId });
            await model.updateOne(claim, { $set: { status: 'sent', sentAt: now() }, $unset: { leaseToken: '', leaseUntil: '', lastError: '' } });
            result.sent++;
        } catch {
            const dead = job.attempts >= MAX_EMAIL_ATTEMPTS;
            await model.updateOne(claim, { $set: { status: dead ? 'dead' : 'queued',
                nextAttemptAt: new Date(+now() + Math.min(24 * 60, 15 * 2 ** (job.attempts - 1)) * 60000),
                lastError: 'Email delivery failed; inspect existing server diagnostics',
            }, $unset: { leaseToken: '', leaseUntil: '' } });
            result[dead ? 'dead' : 'retrying']++;
        }
    }
    return result;
}
