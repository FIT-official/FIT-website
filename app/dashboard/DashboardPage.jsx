'use client'

import Dashboard from './Dashboard'

// Authentication is enforced by middleware;
// server quotas distinguish plans.
export default function DashboardPage({
    creatorTermsRequired = false,
}) {
    return (
        <Dashboard
            creatorTermsRequired={creatorTermsRequired}
        />
    )
}
