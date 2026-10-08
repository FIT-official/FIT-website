import { createHash } from 'node:crypto'
import { WORKSHOP_SESSION } from './workshopFeedback'
export class FeedbackStoreError extends Error {
    constructor(message, status) { super(message); this.status = status }
}
export async function recordWorkshopFeedback(collection, budgets, payload, now = new Date()) {
    const { submissionId, ...content } = payload
    const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex')
    const receipt = row => ({ receipt: row._id, recordedAt: row.createdAt.toISOString(), reviewState: row.reviewedAt ? 'reviewed' : 'awaiting review' })
    function existing(row) {
        if (row.payloadHash !== hash) throw new FeedbackStoreError('This submission was already recorded with different feedback. Start a new submission.', 409)
        return receipt(row)
    }
    const previous = await collection.findOne({ _id: submissionId })
    if (previous) return existing(previous)
    if (now < new Date('2026-10-08T00:00:00Z') || now > new Date('2026-10-10T16:00:00Z')) throw new FeedbackStoreError('This workshop is not accepting new feedback.', 410)
    // A shared database budget bounds public writes across all server instances.
    // No IP address, account identity or new external limiter is needed.
    await budgets.updateOne({ _id: WORKSHOP_SESSION }, { $setOnInsert: { count: 0 } }, { upsert: true })
    const allowance = await budgets.updateOne({ _id: WORKSHOP_SESSION, count: { $lt: 4000 } }, { $inc: { count: 1 } })
    if (!allowance.modifiedCount) throw new FeedbackStoreError('Feedback collection is full. Keep your draft and show your teacher.', 429)
    const row = { _id: submissionId, ...content, payloadHash: hash, createdAt: now, reviewedAt: null }
    try { await collection.insertOne(row) }
    catch (error) {
        if (error.code !== 11000) throw error
        const raced = await collection.findOne({ _id: submissionId })
        if (!raced) throw error
        return existing(raced)
    }
    return receipt(row)
}
