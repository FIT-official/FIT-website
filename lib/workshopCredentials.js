import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
export const CLASS_EXPIRY = new Date('2026-10-11T00:00:00Z')
// Schema capacity is independent of the actual roster. Only existing enabled
// account records authorise a seat; this does not create additional accounts.
export const validSeat = seat => /^group(?:[1-9]|10)student(?:[1-9]|10)$/.test(seat || '')
export const groupForSeat = seat => validSeat(seat) ? 'g' + seat.match(/^group(\d+)student/)[1] : null
export function passwordHash(password, salt = randomBytes(16).toString('hex')) { return salt + ':' + scryptSync(password, salt, 32).toString('hex') }
export function passwordMatches(password, stored) {
    if (typeof stored !== 'string' || !/^[0-9a-f]{32}:[0-9a-f]{64}$/.test(stored)) return false
    const [salt, expected] = stored.split(':')
    return timingSafeEqual(scryptSync(password, salt, 32), Buffer.from(expected, 'hex'))
}
export const sessionHash = token => createHash('sha256').update(token).digest('hex')
export function activeAccount(account, now = new Date()) { return Boolean(account?.enabled && validSeat(account._id) && account.group === groupForSeat(account._id) && account.expiresAt instanceof Date && account.expiresAt > now && now < CLASS_EXPIRY) }
export function parseClassToken(request) {
    const token = (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith('fit_workshop='))?.slice(13)
    return /^[0-9a-f]{64}$/.test(token || '') ? token : null
}
