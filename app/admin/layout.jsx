import { dashboardEnabled, fixtureMode } from '@/lib/creatorDashboard/flags';
import Link from 'next/link';
import { PRIVATE_PAGE_ROBOTS } from '@/lib/seo/metadata'

export const metadata = { robots: PRIVATE_PAGE_ROBOTS }

export default function PrivateLayout({ children }) {
    if (fixtureMode()) return children;
    return <>{dashboardEnabled() && <Link href='/admin/creator-dashboard'>Creator workspace</Link>}{children}</>
}