import { NextResponse } from 'next/server'
import { readMaintenanceConfig, isPageActive } from './config'
import { constantTimeEqual, isMaintenanceExempt, isMaintenanceOwner, maintenanceCookie, maintenanceCookieValue } from './access'

export async function maintenanceResponse(auth, req) {
    const url = new URL(req.url)
    const secret = process.env.MAINTENANCE_BYPASS_SECRET
    const candidate = url.searchParams.get('maintenance_bypass')
    let validCookie = false
    if (secret && (candidate !== null || maintenanceCookie(req))) {
        try {
            const cookieValue = await maintenanceCookieValue(secret)
            if (candidate !== null && await constantTimeEqual(candidate, secret)) {
                url.searchParams.delete('maintenance_bypass')
                const response = NextResponse.redirect(url, 307)
                response.headers.set('Cache-Control', 'no-store')
                response.headers.set('Referrer-Policy', 'no-referrer')
                response.cookies.set('fit_mbypass', cookieValue, {
                    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 12 * 60 * 60,
                })
                return response
            }
            validCookie = await constantTimeEqual(maintenanceCookie(req), cookieValue)
        } catch { /* Web Crypto failure grants no secret/cookie bypass. */ }
    }
    if (isMaintenanceExempt(url.pathname) || validCookie) return null
    const cfg = await readMaintenanceConfig()
    const now = Date.now()
    if (!isPageActive(cfg.page, now)) return null
    try { if (await isMaintenanceOwner(await auth())) return null } catch { /* No verified owner. */ }
    const target = new URL('/maintenance', url)
    const response = NextResponse.rewrite(target, { status: 503 })
    const retry = cfg.page.until ? Math.max(1, Math.ceil((Date.parse(cfg.page.until) - now) / 1000)) : 1800
    response.headers.set('Retry-After', String(retry))
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Robots-Tag', 'noindex')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
}
