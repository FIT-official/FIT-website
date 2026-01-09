'use client'

import Dashboard from "./Dashboard"
import Fallback from "./Fallback";
import useAccess from "@/utils/useAccess";
import useSubscription from "@/utils/useSubscription";


function DashboardPage() {
    const { loading: accessLoading, canAccess, isAdmin } = useAccess();
    const { loading: subLoading, subscription } = useSubscription();

    const loading = accessLoading || subLoading;

    const hasSubscription = !!subscription?.priceId;
    const shouldAllowAccess = isAdmin || hasSubscription;

    return (
        <>
            {loading ? (
                <div className='flex items-center justify-center h-[92vh] w-full border-b border-borderColor'>
                    <div className='loader' />
                </div>
            ) : shouldAllowAccess ? (
                <Dashboard />
            ) : (
                <Fallback />
            )}
        </>
    );
}

export default DashboardPage;