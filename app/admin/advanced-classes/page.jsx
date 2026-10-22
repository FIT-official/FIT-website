import AdminAccessView, { AccessMessage } from '@/components/AdvancedClasses/AdminAccessView'
import { loadAdminAccessView } from '@/lib/advancedClasses/adminAccess'
import { ADMIN_PAGE_PATH } from '@/lib/advancedClasses/config'
import { defaultAdminDeps } from '@/lib/advancedClasses/defaults.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Advanced Classes access',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
}

// Admin role is checked on the server before binding identities are fetched or rendered.
export default async function AdvancedClassesAccessPage({ deps } = {}) {
  const result = await loadAdminAccessView(deps || defaultAdminDeps())
  if (result.status === 401) {
    return <AccessMessage title="Sign in required" signInHref={`/sign-in?redirect_url=${encodeURIComponent(ADMIN_PAGE_PATH)}`}>Sign in with an admin account to view this page.</AccessMessage>
  }
  if (result.status === 403) return <AccessMessage title="Access denied">An admin account is needed to view this page.</AccessMessage>
  if (result.status !== 200) return <AccessMessage title="Unavailable">This page could not be loaded. Please try again.</AccessMessage>
  return <AdminAccessView view={result.body} />
}
