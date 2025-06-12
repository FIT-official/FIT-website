'use client'
import ProductForm from '@/components/DashboardComponents/ProductForm'
import { SignOutButton, useUser } from '@clerk/nextjs'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'

function Dashboard() {
    const { user } = useUser();
    const [myProducts, setMyProducts] = useState([]);
    const [productToEdit, setProductToEdit] = useState(null);
    const [mode, setMode] = useState("Create");

    useEffect(() => {
        if (!user) return;
        const fetchProducts = async () => {
            const res = await fetch(`/api/product/${user.id}`);
            const data = await res.json();
            setMyProducts(data.products || []);
        };
        fetchProducts();
    }, [user, mode]);

    // When productToEdit changes, update mode accordingly
    useEffect(() => {
        setMode(productToEdit ? "Edit" : "Create");
    }, [productToEdit]);

    return (
        <div className="flex flex-col h-screen w-screen items-center justify-center gap-4 px-12">
            <div className='flex h-[60%] w-full flex-row gap-4'>
                <div className='px-4 py-2 border rounded-sm w-[60%] h-full overflow-auto'>
                    <ProductForm
                        mode={mode}
                        product={productToEdit}
                        setProduct={setProductToEdit}
                        setMode={setMode}
                    />
                </div>
                <div className="w-[40%] px-4 py-2 border rounded-sm h-full overflow-auto">
                    <h2 className="font-bold mb-2">Your Products</h2>
                    {myProducts && myProducts.length === 0 && <div>No products found.</div>}
                    <ul className="flex flex-col">
                        {myProducts && myProducts.map((product) => (
                            <li key={product._id} className='flex flex-col mb-2'>
                                <div className="font-semibold">{product.name}</div>
                                <button
                                    className="mt-2 px-3 py-1 border rounded "
                                    onClick={() => setProductToEdit(product)}
                                >
                                    Edit
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
            <div className='flex w-full items-start flex-col'>
                <Link href='/account'>Go To Account</Link>
                <SignOutButton />
            </div>
        </div>
    )
}

export default Dashboard