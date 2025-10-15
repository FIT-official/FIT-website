'use client'

import Dashboard from "./Dashboard"
import Fallback from "./Fallback";
import useAccess from "@/utils/useAccess";
import useSubscription from "@/utils/useSubscription";

function DashboardPage() {
    const { loading: accessLoading, canAccess, isAdmin } = useAccess();
    const { loading: subLoading, hasActiveSubscription } = useSubscription();

    // Wait for both checks to complete
    const loading = accessLoading || subLoading;

    if (loading) return <div className='flex items-center justify-center h-[92vh] w-full border-b border-borderColor'>
        <div className='loader' />
    </div>;

    // Allow access if:
    // 1. User is admin (from useAccess) OR
    // 2. User has active subscription AND general access check passes
    const shouldAllowAccess = isAdmin || (hasActiveSubscription && canAccess);

    if (!shouldAllowAccess) return <Fallback />;

    return <Dashboard />;
}

export default DashboardPage;