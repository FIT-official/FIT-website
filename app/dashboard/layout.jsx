import { dashboardEnabled, fixtureMode } from '@/lib/creatorDashboard/flags';
import { headers } from 'next/headers';
import Link from 'next/link';
// Shared creator shell for every /dashboard/* route (blueprint §5.1): one
// rail + canvas layout provider instead of a per-page copy. This layout is a
// server component; CreatorShell is the client boundary. Auth stays where it
// was — each page keeps its own Clerk/subscription gating client-side (home
// via DashboardPage, product create/edit via useAccess, messages via
// entitlements), so the shell renders for any signed-in state and the gated
// pages swap their own content for Fallback inside the rail.
import CreatorShell from "@/components/DashboardComponents/CreatorShell";
import { PRIVATE_PAGE_ROBOTS } from '@/lib/seo/metadata';

export const metadata = { robots: PRIVATE_PAGE_ROBOTS };

export default async function DashboardLayout({ children }) {
    if (fixtureMode() || (dashboardEnabled() && (await headers()).get('x-fit-creator-surface') === 'dashboard')) return children;
    return <CreatorShell>{dashboardEnabled() && <Link href='/dashboard/creator/orders'>Creator workspace</Link>}{children}</CreatorShell>;
}
