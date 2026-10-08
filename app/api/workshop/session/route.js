import { randomBytes } from 'node:crypto'
import { activeAccount, passwordMatches, sessionHash, validSeat, CLASS_EXPIRY, parseClassToken } from '@/lib/workshopCredentials'
import { WORKSHOP_SESSION } from '@/lib/workshopFeedback'
import { classDb, classJson, classFailure, sameOrigin, jsonBody, limitClassOperation } from '@/lib/workshopHttp'
export const runtime = 'nodejs'
export async function POST(request) {
    try {
        sameOrigin(request)
        const input = await jsonBody(request, 1000)
        if (!validSeat(input.seat) || typeof input.password !== 'string' || input.password.length > 100) return classJson({ error: 'Check your temporary class login.' }, 401)
        const db = await classDb()
        await limitClassOperation(db, 'login-global', 300)
        await limitClassOperation(db, 'login-' + input.seat, 8)
        const account = await db.collection('workshopAccounts').findOne({ _id: input.seat, session: WORKSHOP_SESSION })
        if (!activeAccount(account) || !passwordMatches(input.password, account.passwordHash)) return classJson({ error: 'Check your temporary class login or ask your teacher.' }, 401)
        const token = randomBytes(32).toString('hex')
        await db.collection('workshopSessions').insertOne({ _id: sessionHash(token), session: WORKSHOP_SESSION, seat: account._id, expiresAt: CLASS_EXPIRY, createdAt: new Date() })
        const response = classJson({ group: account.group, seat: account._id, expiresAt: CLASS_EXPIRY.toISOString() })
        response.cookies.set('fit_workshop', token, { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/workshop', expires: CLASS_EXPIRY })
        return response
    } catch (error) { return classFailure(error) }
}
export async function DELETE(request) {
    try {
        sameOrigin(request)
        const token = parseClassToken(request)
        if (token) await (await classDb()).collection('workshopSessions').deleteOne({ _id: sessionHash(token) })
        const response = classJson({ signedOut: true })
        response.cookies.set('fit_workshop', '', { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/workshop', maxAge: 0 })
        return response
    } catch (error) { return classFailure(error) }
}
