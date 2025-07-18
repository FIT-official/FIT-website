'use client'
import Link from 'next/link'
import React from 'react'
import { LuBoxes, LuCirclePlus } from 'react-icons/lu'

function Collections() {
    return (
        <div className="col-span-4 lg:col-span-1 row-span-1  px-6 py-2 flex flex-col">
            <div className="flex items-center font-medium text-lg">
                <LuBoxes className="mr-2" />
                Collections
            </div>
            <div className="flex border-t border-borderColor w-full h-0 my-2" />
            <Link href='/dashboard/products' className="collectionItem">
                Products
                <LuCirclePlus className="ml-2" size={20} />
            </Link>
            {/* <Link href='/dashboard/products' className="collectionItem">
                Events & Discounts
                <LuCirclePlus className="ml-2" size={20} />
            </Link> */}
        </div>
    )
}

export default Collections