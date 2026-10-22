import { handleAccessGet, methodNotAllowed } from '@/lib/advancedClasses/adminAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Read-only. Admin role is checked on the server before any binding identity is read or returned.
export async function GET() {
  return handleAccessGet(async () => (await import('@/lib/advancedClasses/defaults.server')).defaultAdminDeps())
}

const readOnly = () => methodNotAllowed()
export { readOnly as POST, readOnly as PUT, readOnly as PATCH, readOnly as DELETE }
