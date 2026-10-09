import { clerkClient } from '@clerk/nextjs/server'

const OWNER_TTL_MS = 10_000
const owners = new Map()
const encoder = new TextEncoder()

export function isMaintenanceExempt(pathname) {
    return /^\/(?:api|trpc|admin|sign-in|sign-up|maintenance|_next)(?:\/|$)/.test(pathname)
        || /^\/(?:robots\.txt|sitemap(?:[-/][^?]*)?\.xml|favicon\.ico)$/.test(pathname)
        || /\.(?:html?|css|js|mjs|json|map|jpe?g|avif|webp|png|gif|svg|ico|bmp|tiff?|ttf|otf|woff2?|eot|txt|xml|pdf|csv|docx?|xlsx?|zip|webmanifest|mp4|webm|mp3|wav|glb|gltf|stl|3mf)$/i.test(pathname)
}

// The application defines privileged users via publicMetadata.role === 'admin'
// (lib/checkPrivileges.js). A token's metadata claim mirrors that public metadata.
export async function isMaintenanceOwner({ userId, sessionClaims } = {}) {
    if (!userId) return false
    const role = sessionClaims?.metadata?.role
    if (typeof role === 'string') return role === 'admin'
    const entry = owners.get(userId)
    if (entry && Date.now() < entry.expires) return entry.owner
    let owner = false
    try {
        owner = (await (await clerkClient()).users.getUser(userId))?.publicMetadata?.role === 'admin'
    } catch { /* A failed role lookup grants no bypass. */ }
    if (owners.size >= 256) owners.clear()
    owners.set(userId, { owner, expires: Date.now() + OWNER_TTL_MS })
    return owner
}

// Compare fixed-size digests with no content-dependent early exit. Hashing first
// avoids a prefix or length comparison against the configured secret.
export async function constantTimeEqual(left, right) {
    const [a, b] = await Promise.all([left, right].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))))
    const aa = new Uint8Array(a)
    const bb = new Uint8Array(b)
    let difference = 0
    for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i]
    return difference === 0
}

export async function maintenanceCookieValue(secret) {
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode('fit-maintenance-bypass-v1'))
    return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function maintenanceCookie(req) {
    return req.cookies?.get('fit_mbypass')?.value
        || req.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith('fit_mbypass='))?.slice('fit_mbypass='.length)
        || ''
}
