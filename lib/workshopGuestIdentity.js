import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { CLASS_EXPIRY } from './workshopCredentials'
import { WORKSHOP_SESSION } from './workshopFeedback'
export const GUEST_COOKIE = 'fit_workshop_guest'
export const guestGroup = value => /^g(?:[1-9]|10)$/.test(value || '')
export const guestSeat = value => /^guest_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '')
export const validGuestAccess = access => access?.role === 'student' && access.guest === true && guestSeat(access.seat) && guestGroup(access.group)
export class GuestAccessError extends Error { constructor(message, status = 403) { super(message); this.status = status } }
// The user-approved release enables only guest endpoints. A server flag can
// disable them; teacher-owned entry is independently closed until explicitly opened.
export function requireGuestEnabled(env = process.env) { if (env.WORKSHOP_GUEST_ENABLED === 'false') throw new GuestAccessError('Group entry is not open yet.', 503) }
export function guestName(value) {
    if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) throw new GuestAccessError('Enter the name you want your teacher to see.', 400)
    const name = value.normalize('NFC').trim().replace(/ +/g, ' ')
    if (!name || name.length > 60 || !/^[\p{L}\p{M}\p{N} .'-]+$/u.test(name) || !/\p{L}/u.test(name)) throw new GuestAccessError('Use a name of up to 60 characters. Leave out links and contact details.', 400)
    return name
}
export const guestHash = token => createHash('sha256').update(token).digest('hex')
export function guestToken(request) {
    const token = (request.headers.get('cookie') || '').split(';').map(row => row.trim()).find(row => row.startsWith(GUEST_COOKIE + '='))?.slice(GUEST_COOKIE.length + 1)
    return /^[0-9a-f]{64}$/.test(token || '') ? token : null
}
export function newGuest(group, name, now = new Date()) {
    if (!guestGroup(group)) throw new GuestAccessError('Choose Group 1 to 10.', 400)
    if (now >= CLASS_EXPIRY) throw new GuestAccessError('This workshop has ended.', 410)
    const token = randomBytes(32).toString('hex'), expiresAt = new Date(Math.min(now.getTime() + 24 * 60 * 60 * 1000, CLASS_EXPIRY.getTime()))
    return { token, record: { _id: guestHash(token), session: WORKSHOP_SESSION, seat: 'guest_' + randomUUID(), group, name: guestName(name), enabled: true, expiresAt, createdAt: now } }
}
export function guestAccess(record, now = new Date()) {
    if (!record?.enabled || record.session !== WORKSHOP_SESSION || !guestSeat(record.seat) || !guestGroup(record.group) || !(record.expiresAt instanceof Date) || record.expiresAt <= now || now >= CLASS_EXPIRY) throw new GuestAccessError('Your workshop session ended. Your saved work is kept.', 401)
    return { role: 'student', guest: true, seat: record.seat, group: record.group, name: record.name, expiresAt: record.expiresAt }
}
export function guestCookie(token = '', expiresAt, now = new Date()) { return `${GUEST_COOKIE}=${token}; Path=/api/workshop/guest; HttpOnly; Secure; SameSite=Strict; Max-Age=${token ? Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)) : 0}` }
