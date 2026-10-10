import { notFound } from 'next/navigation'
import { isDraftPreview } from './draftAccess'

export async function requireDraftAccess() {
    // Preview readers never initialize authentication or any database module.
    if (isDraftPreview()) return
    let allowed = false
    try {
        const { auth } = await import('@clerk/nextjs/server')
        const { userId } = await auth()
        if (userId) {
            const { checkAdminPrivileges } = await import('@/lib/checkPrivileges')
            allowed = await checkAdminPrivileges(userId)
        }
    } catch { /* A missing or unverifiable session never grants access. */ }
    if (!allowed) notFound()
}
