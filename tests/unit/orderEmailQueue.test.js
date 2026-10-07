import { describe, expect, it, vi } from 'vitest';
const queue = vi.hoisted(() => ({ updateOne: vi.fn() }));
vi.mock('@/models/OrderEmail', () => ({ default: queue }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));
import { enqueueOrderEmail, drainOrderEmails, MAX_EMAIL_ATTEMPTS, orderEmailKey } from '@/lib/orderEmailQueue';
function fixture() {
    let clock = new Date('2026-10-07T10:00:00Z');
    const job = { _id: orderEmailKey('cs_test'), to: 'buyer@example.test', subject: 'Paid order', html: '<p>Black PETG</p>', attempts: 0, status: 'queued', nextAttemptAt: clock };
    const model = {
        updateMany: vi.fn(async () => {
            if (job.status === 'sending' && job.attempts >= MAX_EMAIL_ATTEMPTS && job.leaseUntil <= clock) job.status = 'dead';
        }),
        findOneAndUpdate: vi.fn(async (_query, update) => {
            if (job.attempts >= MAX_EMAIL_ATTEMPTS || job.nextAttemptAt > clock || (job.status !== 'queued' && !(job.status === 'sending' && job.leaseUntil <= clock))) return null;
            Object.assign(job, update.$set); job.attempts++; return { ...job };
        }),
        updateOne: vi.fn(async (claim, update) => {
            if (claim.leaseToken !== job.leaseToken) return;
            Object.assign(job, update.$set); for (const k of Object.keys(update.$unset || {})) delete job[k];
        }),
    };
    return { job, model, now: () => clock, advance: ms => { clock = new Date(+clock + ms); } };
}
describe('durable order confirmation retries', () => {
    it('enqueues an immutable payload under a deterministic id in the order transaction', async () => {
        const session = { id: 'transaction' }, email = { to: 'buyer@example.test', subject: 'Order', html: '<p>Purchased variant</p>' };
        await enqueueOrderEmail('cs_test', email, session);
        expect(queue.updateOne).toHaveBeenCalledWith({ _id: orderEmailKey('cs_test') }, { $setOnInsert: expect.objectContaining(email) }, { upsert: true, session });
        queue.updateOne.mockClear(); await enqueueOrderEmail('cs_test', { to: '' }, session);
        expect(queue.updateOne).not.toHaveBeenCalled();
    });
    it('concurrent workers share a single lease', async () => {
        const f = fixture(), deliver = vi.fn().mockResolvedValue(undefined);
        await Promise.all([drainOrderEmails({ ...f, deliver }), drainOrderEmails({ ...f, deliver })]);
        expect(deliver).toHaveBeenCalledTimes(1);
    });
    it('claims before delivery and prevents replay after success', async () => {
        const f = fixture(), deliver = vi.fn().mockResolvedValue(undefined);
        expect(await drainOrderEmails({ ...f, deliver })).toEqual({ sent: 1, retrying: 0, dead: 0 });
        await drainOrderEmails({ ...f, deliver });
        expect(deliver).toHaveBeenCalledTimes(1);
        expect(deliver.mock.calls[0][0].messageId).toMatch(/^<fit-order-.*@fixitoday.com>$/);
        expect(f.job.status).toBe('sent');
    });
    it('backs off, preserves the snapshot and dead-letters after five failures', async () => {
        const f = fixture(), deliver = vi.fn().mockRejectedValue(new Error('secret SMTP details'));
        await drainOrderEmails({ ...f, deliver });
        await drainOrderEmails({ ...f, deliver });
        expect(deliver).toHaveBeenCalledTimes(1);
        for (let i = 1; i < 5; i++) { f.advance(24 * 3600000); await drainOrderEmails({ ...f, deliver }); }
        f.advance(24 * 3600000); await drainOrderEmails({ ...f, deliver });
        expect(deliver).toHaveBeenCalledTimes(5); expect(f.job.status).toBe('dead');
        expect(f.job.html).toContain('Black PETG'); expect(f.job.lastError).not.toContain('secret');
    });
    it('does not steal an active lease and recovers an expired one', async () => {
        const f = fixture(), deliver = vi.fn().mockResolvedValue(undefined);
        f.job.status = 'sending'; f.job.attempts = 1; f.job.leaseUntil = new Date(+f.now() + 300000);
        await drainOrderEmails({ ...f, deliver }); expect(deliver).not.toHaveBeenCalled();
        f.advance(300001); await drainOrderEmails({ ...f, deliver }); expect(deliver).toHaveBeenCalledTimes(1);
    });
    it('dead-letters a worker crash on the final attempt', async () => {
        const f = fixture(), deliver = vi.fn(); f.job.status = 'sending'; f.job.attempts = 5; f.job.leaseUntil = new Date(+f.now() - 1);
        await drainOrderEmails({ ...f, deliver }); expect(f.job.status).toBe('dead'); expect(deliver).not.toHaveBeenCalled();
    });
});
