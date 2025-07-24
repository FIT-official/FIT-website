'use client'

import Dashboard from "./Dashboard"
import Fallback from "./Fallback";
import useAccess from "@/utils/useAccess";

function DashboardPage() {
    const { loading, canAccess } = useAccess();

    if (loading) return <div className='flex items-center justify-center h-[92vh] w-full border-b border-borderColor'>
        <div className='loader' />
    </div>;

    if (!canAccess) return <Fallback />;
    return <Dashboard />;
}

export default DashboardPage;