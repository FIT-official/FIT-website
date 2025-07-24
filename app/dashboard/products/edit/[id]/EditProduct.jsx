'use client';
import ProductForm from "@/components/DashboardComponents/ProductForm";
import { useUser } from "@clerk/nextjs";
import { useRouter, useParams } from "next/navigation"
import { useEffect, useState } from "react";

function EditProduct() {
    const { user, isLoading } = useUser();
    const params = useParams();
    const productId = params.id;
    const [productToEdit, setProductToEdit] = useState(null);
    const router = useRouter();

    useEffect(() => {
        if (!user || isLoading) return;

        if (!productId) {
            router.push('/dashboard/products');
            return;
        }

        const fetchProduct = async () => {
            const res = await fetch(`/api/product?ids=${productId}`);
            const data = await res.json();
            if (data.products && data.products.length > 0) {
                setProductToEdit(data.products[0]);
            } else {
                console.error('Product not found');
            }
        };

        fetchProduct();
    }, [productId, user, isLoading, router]);

    return (
        <div className='flex w-full flex-col py-20 border-b border-borderColor px-8 md:px-16'>
            <ProductForm
                mode="Edit"
                product={productToEdit}
            />
        </div>
    )
}

export default EditProduct