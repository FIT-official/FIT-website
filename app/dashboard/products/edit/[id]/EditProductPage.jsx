'use client'

import EditProduct from "./EditProduct";
import Fallback from "./Fallback";
import useAccess from "@/utils/useAccess";

function EditProductPage() {
    const { loading, canAccess } = useAccess();

    if (loading) return <div className='flex items-center justify-center h-[92vh] w-full border-b border-borderColor'>
        <div className='loader' />
    </div>;

    if (!canAccess) return <Fallback />;
    return <EditProduct />;
}

export default EditProductPage;