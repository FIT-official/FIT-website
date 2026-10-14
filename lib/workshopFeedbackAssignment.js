import { createHash } from 'node:crypto'
import { WORKSHOP_SESSION } from './workshopFeedback'
import { assignedReview, PROJECT_VERSION } from './workshopReview'
import { validGuestAccess, guestGroup } from './workshopGuestIdentity'
import { GUEST_CLASS_EXPIRY } from './workshopGuestPolicy'
export class FeedbackAssignmentError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
const reviewer = seat => createHash('sha256').update(seat).digest('hex')
function completedReviews(state, assignment) {
    const result = { 1: new Set(), 2: new Set() }
    for (const row of state.feedback || []) if (row.presentingGroup === assignment.target && row.reviewRound === assignment.round && row.projectVersion === assignment.projectVersion && row.visibility !== 'deleted' && ['1', '2'].includes(row.idea) && row.seat) result[row.idea].add(reviewer(row.seat))
    return result
}
export async function assignFeedbackIdea(store, access, expected, now = new Date()) {
    if (!validGuestAccess(access) || now >= GUEST_CLASS_EXPIRY) throw new FeedbackAssignmentError('Use your current class session.', 403)
    const author = reviewer(access.seat)
    for (let attempt = 0; attempt < 40; attempt++) {
        const state = await store.findOne({ _id: WORKSHOP_SESSION })
        if (!state) throw new FeedbackAssignmentError('The class is not ready.', 409)
        const required = assignedReview(state, access.group)
        if (expected.expectedSeat !== access.seat || !guestGroup(expected.target) || expected.target === access.group || expected.round !== required.round || expected.projectVersion !== required.projectVersion || required.projectVersion !== PROJECT_VERSION) throw new FeedbackAssignmentError('The class assignment changed. Your drafts are kept; refresh.', 409)
        const requiredDone = completedReviews(state, required)
        if (expected.target !== required.target && !['1', '2'].every(idea => requiredDone[idea].has(author))) throw new FeedbackAssignmentError('First review both ideas for Group ' + required.target.slice(1) + '. Your drafts are kept.', 409)
        const assignment = { ...required, target: expected.target }
        const id = WORKSHOP_SESSION + ':feedback-ideas:' + assignment.target + ':' + assignment.round + ':' + assignment.projectVersion, previous = await store.findOne({ _id: id }), done = completedReviews(state, assignment)
        const existing = previous?.assignments.find(row => row.reviewer === author)
        const response = firstIdea => ({ seat: access.seat, ...assignment, firstIdea, completed: { 1: done[1].has(author), 2: done[2].has(author) } })
        if (existing) return response(existing.firstIdea)
        const loads = { 1: done[1].size, 2: done[2].size }
        for (const row of previous?.assignments || []) if (!done[row.firstIdea].has(row.reviewer)) loads[row.firstIdea]++
        const tie = loads[1] === loads[2], incomplete = done[1].has(author) !== done[2].has(author)
        const firstIdea = incomplete ? done[1].has(author) ? '2' : '1' : loads[1] < loads[2] ? '1' : loads[2] < loads[1] ? '2' : previous?.tieNext || '1'
        const next = { ...(previous || {}), _id: id, kind: 'feedback-idea-assignments', session: WORKSHOP_SESSION, target: assignment.target, round: assignment.round, projectVersion: assignment.projectVersion, version: (previous?.version || 0) + 1, tieNext: tie && !incomplete ? firstIdea === '1' ? '2' : '1' : previous?.tieNext || '1', assignments: [...(previous?.assignments || []), { reviewer: author, firstIdea, assignedAt: now.toISOString() }] }
        if (next.assignments.length > 3000 || Buffer.byteLength(JSON.stringify(next)) > 2000000) throw new FeedbackAssignmentError('Assignment capacity reached. Previous assignments are kept; ask your teacher.', 429)
        try {
            if (!previous) await store.insertOne(next)
            else if (!(await store.replaceOne({ _id: id, version: previous.version }, next)).modifiedCount) continue
            return response(firstIdea)
        } catch (error) { if (error.code !== 11000) throw error }
    }
    throw new FeedbackAssignmentError('Another reviewer opened at the same time. Please retry.', 409)
}
