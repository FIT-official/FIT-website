'use client'
import Link from 'next/link'
import React from 'react'
import { LuBoxes, LuCirclePlus } from 'react-icons/lu'

function Collections() {
    return (
        <div className="dashboardSection">
            <div className="flex items-center font-semibold py-3 px-4">
                <LuBoxes className="mr-2" />
                Collections
            </div>
            <div className='flex flex-col gap-1 text-xs font-normal p-4'>
                <Link href='/dashboard/products' className="collectionItem">
                    Products
                    <LuCirclePlus className="ml-2" />
                </Link>
            </div>
        </div>
    )
}

export default Collections