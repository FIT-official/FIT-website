import { guestAccess, guestHash, guestToken, guestCookie, GuestAccessError } from './workshopGuestIdentity'
import { GUEST_CLASS_EXPIRY } from './workshopGuestPolicy'
import { WORKSHOP_SESSION } from './workshopFeedback'

// Only possession of an existing, enabled, unexpired private cookie can renew
// its own record. No name lookup, new identity, approval or assignment is involved.
export async function renewGuestSession(sessions, token, row) {
    const access = guestAccess(row)
    if (access.expiresAt >= GUEST_CLASS_EXPIRY) return access
    await sessions.updateOne({
        _id: guestHash(token), session: WORKSHOP_SESSION, enabled: true,
        seat: access.seat, group: access.group,
        expiresAt: { $eq: access.expiresAt, $gt: new Date() },
    }, { $set: { expiresAt: new Date(GUEST_CLASS_EXPIRY) } })
    // This also handles a concurrent renewal, expiry or revocation. A lost
    // compare-and-set must never revive an expired or disabled session.
    const current = guestAccess(await sessions.findOne({ _id: guestHash(token) }))
    if (current.seat !== access.seat || current.group !== access.group || current.expiresAt < GUEST_CLASS_EXPIRY) throw new GuestAccessError('Your class session changed. Ask your teacher for help.', 401)
    return current
}

export function withGuestCookie(response, request, access) {
    // Re-send even after database renewal: a previous response may have been lost.
    // The fixed cutoff prevents polling from extending access indefinitely.
    const expiresAt = new Date(Math.min(access.expiresAt.getTime(), GUEST_CLASS_EXPIRY.getTime()))
    response.headers.set('Set-Cookie', guestCookie(guestToken(request), expiresAt))
    return response
}
