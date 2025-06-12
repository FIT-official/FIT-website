import ProductForm from '@/components/DashboardComponents/ProductForm'
import { SignOutButton } from '@clerk/nextjs'
import Link from 'next/link'
import React from 'react'

function Dashboard() {
    return (
        <div className="flex flex-col h-screen w-screen items-center justify-center gap-4">
            <div>Dashboard</div>
            <div className='px-4 py-2 border rounded-sm w-[60%] h-[60%] overflow-auto'>
                <ProductForm mode={"Create"} />
            </div>
            <div className='flex flex-col'>
                <Link href='/account'>Go To Account</Link>
                <SignOutButton />
            </div>
        </div>
    )
}

export default Dashboard