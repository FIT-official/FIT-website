'use client'

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

function Print() {
    const { user, isLoaded } = useUser();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const [selectedVariants, setSelectedVariants] = useState({});

    useEffect(() => {
        const fetchProducts = async () => {
            const res = await fetch("/api/product?productType=print");
            const data = await res.json();
            setProducts(data.products || []);
        };
        fetchProducts();
    }, []);

    const handleVariantChange = (productId, variantId) => {
        setSelectedVariants(prev => ({
            ...prev,
            [productId]: variantId,
        }));
    };

    const handleAddToCart = async (product) => {
        if (!isLoaded || !user) {
            router.push("/sign-in");
            return;
        }
        setLoading(true);

        const variantId = selectedVariants[product._id] || product.variants?.[0] || null;

        const cartItem = {
            productId: product._id,
            quantity: 1,
            variantId,
            chosenDeliveryType: product.delivery?.deliveryTypes?.[0]?.type || "selfCollect",
        };
        const res = await fetch("/api/user/cart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cartItem }),
        });
        setLoading(false);
        if (res.ok) {
            alert("Added to cart!");
        } else {
            const data = await res.json();
            alert(data.error || "Failed to add to cart.");
        }
    };

    return (
        <div className='flex flex-col h-screen w-screen items-center justify-center gap-4 px-12'>
            <h1 className="text-2xl font-bold mb-4">Print Products</h1>
            <div className="w-full max-w-2xl flex flex-col gap-4">
                {products.length === 0 && <div>No print products found.</div>}
                {products.map(product => (
                    <div key={product._id} className="border rounded p-4 flex flex-col gap-2">
                        <div className="font-semibold text-lg">{product.name}</div>
                        <div className="text-sm text-gray-600">{product.description}</div>
                        {product.variants && product.variants.length > 0 && (
                            <div>
                                <label>Variant:&nbsp;</label>
                                <select
                                    value={selectedVariants[product._id] || product.variants[0]}
                                    onChange={e => handleVariantChange(product._id, e.target.value)}
                                >
                                    {product.variants.map(v => (
                                        <option value={v} key={v}>{v}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <button
                            className="mt-2 px-3 py-1 border rounded bg-accent text-white"
                            onClick={() => handleAddToCart(product)}
                            disabled={loading}
                        >
                            Add to cart
                        </button>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default Print