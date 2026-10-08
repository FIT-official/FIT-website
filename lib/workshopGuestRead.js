import { workshopDatabase } from './workshopDatabase'
import { guestToken, guestHash, guestAccess, GuestAccessError, requireGuestEnabled } from './workshopGuestIdentity'
import { verifyGuestHome } from './workshopGuestAccess'
import { emptyLesson } from './workshopGuestClassroomStore'
import { CLASS_EXPIRY } from './workshopCredentials'
import { WORKSHOP_SESSION } from './workshopFeedback'

// A fresh session check and its scoped lesson projection share one round trip.
// No authentication result or classroom content is cached across requests.
export async function readGuestClassroom(request, timing) {
    requireGuestEnabled()
    const token = guestToken(request), now = new Date()
    if (!token) throw new GuestAccessError('Choose your group and enter your name.', 401)
    if (now >= CLASS_EXPIRY) guestAccess(null, now)
    const db = await timing.measure('db', workshopDatabase)
    const sessions = db.collection('workshopGuestSessions'), lessons = db.collection('workshopGuestLessons')
    const query = new URL(request.url).searchParams, hint = query.get('seat') || ''
    const number = /^\d+$/.test(query.get('since') || '') ? Number(query.get('since')) : null
    const since = Number.isSafeInteger(number) && number >= 0 ? number : null
    const unchanged = since === null ? false : { $and: [{ $eq: ['$version', since] }, { $eq: ['$$seat', { $literal: hint }] }] }
    const ifChanged = expression => ({ $cond: [unchanged, [], expression] })
    const rows = await timing.measure('snapshot', () => sessions.aggregate([
        { $match: {
            _id: guestHash(token), session: WORKSHOP_SESSION, enabled: true,
            expiresAt: { $type: 'date', $gt: now },
            seat: { $regex: '^guest_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', $options: 'i' },
            group: { $regex: '^g(?:[1-9]|10)$' },
        } },
        { $project: { _id: 0, session: 1, seat: 1, group: 1, name: 1, enabled: 1, expiresAt: 1 } },
        { $lookup: {
            // collectionName comes from the server-owned namespace wrapper.
            // It cannot be supplied in the URL, cookie or request body.
            from: lessons.collectionName, let: { seat: '$seat', group: '$group' },
            pipeline: [
                { $match: { _id: WORKSHOP_SESSION } },
                { $project: {
                    _id: 0, version: 1, phaseVersion: 1, navigationLocked: 1, navigationTarget: 1, navigationVersion: 1, reviewRound: 1, projectVersion: 1, phase: 1, feedbackOpen: 1, refinementOpen: 1, showFeedback: 1,
                    feedback: ifChanged({ $filter: { input: '$feedback', as: 'row', cond: { $or: [{ $and: [{ $eq: ['$$row.presentingGroup', '$$group'] }, { $eq: ['$$row.visibility', 'visible'] }] }, { $eq: ['$$row.seat', '$$seat'] }] } } }),
                    refinements: ifChanged({ $filter: { input: '$refinements', as: 'row', cond: { $eq: ['$$row.group', '$$group'] } } }),
                } },
            ], as: 'lesson',
        } },
    ]).toArray())
    const row = rows[0], access = guestAccess(row) // Recheck expiry after the query as well.
    verifyGuestHome(request, access)
    return { access, state: row.lesson[0] || emptyLesson(), since: hint === access.seat ? since : null }
}
