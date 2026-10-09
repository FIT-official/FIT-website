import { dashboardEnabled, fixtureMode } from '@/lib/creatorDashboard/flags';
import { headers } from 'next/headers';
import Link from 'next/link';
import { PRIVATE_PAGE_ROBOTS } from '@/lib/seo/metadata'

export const metadata = { robots: PRIVATE_PAGE_ROBOTS }

export default async function PrivateLayout({ children }) {
    if (fixtureMode() || (dashboardEnabled() && (await headers()).get('x-fit-creator-surface') === 'dashboard')) return children;
    return <>{dashboardEnabled() && <Link href='/admin/creator-dashboard'>Creator workspace</Link>}{children}</>
}
