'use client'

import ProductForm from "@/components/DashboardComponents/ProductForm"
import useAccess from "@/utils/useAccess";
import Fallback from "../../Fallback";

function CreateProduct() {
    const { loading, canAccess } = useAccess();

    if (loading) return <div className='flex items-center justify-center h-[92vh] w-full border-b border-borderColor'>
        <div className='loader' />
    </div>;

    if (!canAccess) return <Fallback />;
    return <div className='flex w-full flex-col py-20 border-b border-borderColor px-8 md:px-16'>
        <ProductForm mode="Create" />
    </div>

}

export default CreateProduct