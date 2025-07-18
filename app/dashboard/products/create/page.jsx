'use client'

import ProductForm from "@/components/DashboardComponents/ProductForm"

function CreateProduct() {
    return (
        <div className='flex w-full flex-col py-20 border-b border-borderColor px-8 md:px-16'>
            <ProductForm mode="Create" />
        </div>
    )
}

export default CreateProduct