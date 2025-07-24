'use client'

import { useUser } from '@clerk/nextjs'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { GoChevronDown, GoChevronUp, GoPlus } from 'react-icons/go'

function MyProducts() {
    const { user } = useUser();
    const [myProducts, setMyProducts] = useState([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const [sortField, setSortField] = useState('title');
    const [sortOrder, setSortOrder] = useState('asc');

    useEffect(() => {
        if (!user) return;
        const fetchProducts = async () => {
            const res = await fetch(`/api/product?creatorUserId=${user.id}`);
            const data = await res.json();
            if (data.products && data.products.length > 0) {
                setMyProducts(data.products);
            }
        };
        fetchProducts();
    }, [user]);


    const toggleDropdown = () => {
        setIsDropdownOpen((prev) => !prev);
    }

    const getSortedProducts = () => {
        const sorted = [...myProducts];
        sorted.sort((a, b) => {
            let aVal, bVal;
            if (sortField === 'title') {
                aVal = a.title?.toLowerCase() || '';
                bVal = b.title?.toLowerCase() || '';
                if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
                return 0;
            }
            if (sortField === 'sales') {
                aVal = Number(a.sales) || 0;
                bVal = Number(b.sales) || 0;
                return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
            }
            if (sortField === 'createdAt') {
                aVal = new Date(a.createdAt);
                bVal = new Date(b.createdAt);
                return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
            }
            return 0;
        });
        return sorted;
    };

    const sortedProducts = getSortedProducts();

    const handleSort = (field, order) => {
        setSortField(field);
        setSortOrder(order);
    };

    return (
        <div className='flex w-full flex-col min-h-[92vh] py-20 border-b border-borderColor px-8'>
            <div className='flex w-full items-end justify-between'>
                <h1>Products</h1>
                <Link href='/dashboard/products/create' className='border border-borderColor rounded-sm font-normal flex items-center py-1 pl-4 pr-2 text-sm'>
                    Create
                    <GoPlus className='ml-2' />
                </Link>
            </div>
            <div className='flex flex-col mt-4 w-full'>
                <div className='flex justify-between w-full border border-borderColor p-2 rounded-sm bg-baseColor'>
                    <input
                        className='flex w-full px-2 focus:outline-none font-normal text-sm'
                        type='text'
                        placeholder='Search products...'
                    />
                    {/* <div className='flex relative items-center gap-4'>
                        <button onClick={toggleDropdown} className='flex items-center py-1 pl-4 pr-2 bg-textColor text-background rounded-sm font-normal cursor-pointer'>
                            Filter
                            <GoChevronDown className='ml-2' size={20} />
                        </button>
                        <div className={`absolute right-0 top-12 bg-bgColor border border-borderColor bg-background rounded-lg  min-w-64 min-h-40 ${isDropdownOpen ? 'block' : 'hidden'}`}>

                        </div>
                    </div> */}
                </div>
                <div className='flex flex-col w-full mt-4 rounded-sm gap-2'>
                    <div className='flex w-full h-fit px-4 py-2 uppercase font-medium bg-borderColor/40 divide-x gap-4 divide-borderColor items-center text-xs'>
                        <div className='flex flex-2/3 items-center justify-between pr-4'>
                            Title
                            <div className='flex items-center'>
                                <button className='cursor-pointer' onClick={() => handleSort('title', 'asc')}>
                                    <GoChevronUp className='ml-2' />
                                </button>
                                <button className='cursor-pointer' onClick={() => handleSort('title', 'desc')}>
                                    <GoChevronDown className='ml-2' />
                                </button>
                            </div>
                        </div>
                        <div className='flex flex-1/6 items-center justify-between pr-4'>
                            Sales
                            <div className='flex items-center'>
                                <button className='cursor-pointer' onClick={() => handleSort('sales', 'asc')}>
                                    <GoChevronUp className='ml-2' />
                                </button>
                                <button className='cursor-pointer' onClick={() => handleSort('sales', 'desc')}>
                                    <GoChevronDown className='ml-2' />
                                </button>
                            </div>
                        </div>
                        <div className='flex flex-1/6 items-center justify-between'>
                            Created At
                            <div className='flex items-center'>
                                <button className='cursor-pointer' onClick={() => handleSort('createdAt', 'asc')}>
                                    <GoChevronUp className='ml-2' />
                                </button>
                                <button className='cursor-pointer' onClick={() => handleSort('createdAt', 'desc')}>
                                    <GoChevronDown className='ml-2' />
                                </button>
                            </div>
                        </div>
                    </div>

                    {sortedProducts.length > 0 ? sortedProducts.map((product, idx) => (
                        <div
                            key={product._id || idx}
                            className={`flex w-full h-fit px-4 py-2 ${idx % 2 === 0 ? 'bg-baseColor' : 'bg-borderColor/15'}`}
                        >
                            <Link href={`/dashboard/products/edit/${product._id}`} className='flex flex-2/3 hover:underline cursor-pointer'>
                                {product.name}
                            </Link>
                            <div className='flex flex-1/6'>
                                {product.numberSold || 0}
                            </div>
                            <div className='flex flex-1/6'>
                                {product.createdAt ? new Date(product.createdAt).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                            </div>
                        </div>
                    )) : (
                        <div className='flex w-full items-center justify-center text-sm mt-12 text-extraLight'>
                            No products found. Create something!
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default MyProducts