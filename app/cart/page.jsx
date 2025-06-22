'use client'
import React, { useEffect, useState } from 'react'
import { useUser } from "@clerk/nextjs"
import Link from 'next/link';

function Cart() {
    const { user, isLoaded } = useUser();
    const [cart, setCart] = useState([]);
    const [products, setProducts] = useState({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isLoaded || !user) return;
        const fetchCart = async () => {
            const res = await fetch(`/api/user/cart`);
            const data = await res.json();
            setCart(data.cart || []);
            const productIds = (data.cart || []).map(item => item.productId);
            if (productIds.length) {
                const res2 = await fetch(`/api/product?ids=${productIds.join(",")}`);
                const data2 = await res2.json();
                const prodMap = {};
                (data2.products || []).forEach(p => { prodMap[p._id] = p; });
                setProducts(prodMap);
            }
        };
        fetchCart();
    }, [isLoaded, user]);

    const handleDeliveryChange = async (cartItem, newType) => {
        setLoading(true);
        const res = await fetch("/api/user/cart/delivery", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                productId: cartItem.productId,
                variantId: cartItem.variantId || null,
                chosenDeliveryType: newType,
            }),
        });
        setLoading(false);
        if (res.ok) {
            // Refetch cart from backend to ensure UI is in sync
            const cartRes = await fetch(`/api/user/cart`);
            const cartData = await cartRes.json();
            setCart(cartData.cart || []);
        }
    };

    const handleRemove = async (cartItem) => {
        setLoading(true);
        const res = await fetch("/api/user/cart", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                productId: cartItem.productId,
                variantId: cartItem.variantId || null,
            }),
        });
        setLoading(false);
        if (res.ok) {
            setCart(cart =>
                cart.filter(item =>
                    !(item.productId === cartItem.productId && item.variantId === cartItem.variantId)
                )
            );
        }
    };

    const handleChangeQuantity = async (cartItem, delta) => {
        setLoading(true);
        if (delta === 1) {
            const res = await fetch("/api/user/cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cartItem: {
                        productId: cartItem.productId,
                        quantity: 1,
                        variantId: cartItem.variantId || null,
                        chosenDeliveryType: cartItem.chosenDeliveryType,
                    }
                }),
            });
            setLoading(false);
            if (res.ok) {
                setCart(cart =>
                    cart.map(item =>
                        item.productId === cartItem.productId &&
                            item.variantId === cartItem.variantId &&
                            item.chosenDeliveryType === cartItem.chosenDeliveryType
                            ? { ...item, quantity: item.quantity + 1 }
                            : item
                    )
                );
            }
        } else if (delta === -1) {
            if (cartItem.quantity <= 1) {
                // Remove item if quantity would go below 1
                await handleRemove(cartItem);
                setLoading(false);
                return;
            }
            // Otherwise, decrement quantity
            const res = await fetch("/api/user/cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cartItem: {
                        productId: cartItem.productId,
                        quantity: -1,
                        variantId: cartItem.variantId || null,
                        chosenDeliveryType: cartItem.chosenDeliveryType,
                    }
                }),
            });
            setLoading(false);
            if (res.ok) {
                setCart(cart =>
                    cart.map(item =>
                        item.productId === cartItem.productId &&
                            item.variantId === cartItem.variantId &&
                            item.chosenDeliveryType === cartItem.chosenDeliveryType
                            ? { ...item, quantity: item.quantity - 1 }
                            : item
                    )
                );
            }
        }
    };

    const handleVariantChange = async (cartItem, newVariantId) => {
        setLoading(true);
        const res = await fetch("/api/user/cart/variant", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                productId: cartItem.productId,
                oldVariantId: cartItem.variantId || null,
                newVariantId,
                chosenDeliveryType: cartItem.chosenDeliveryType,
            }),
        });
        setLoading(false);
        if (res.ok) {
            // Refetch cart from backend to ensure UI is in sync
            const cartRes = await fetch(`/api/user/cart`);
            const cartData = await cartRes.json();
            setCart(cartData.cart || []);
        }
    };

    return (
        <div className='flex w-screen h-screen items-center justify-center flex-col'>
            <h1 className="mb-4 text-2xl font-bold">Cart Page</h1>
            <div className="w-full max-w-2xl flex flex-col gap-4">
                {cart.length === 0 && <div>Your cart is empty.</div>}
                {cart.map((item, idx) => {
                    const product = products[item.productId];
                    if (!product) return null;
                    const availableDeliveryTypes = product.delivery?.deliveryTypes || [];
                    const availableVariants = product.variants || [];

                    return (
                        <div key={item.productId + (item.variantId || "")} className="border rounded p-4 flex flex-col gap-2">
                            <div className="font-semibold">{product.name}</div>
                            <div className="text-sm text-gray-600">{product.description}</div>
                            {/* Variant Selector */}
                            {availableVariants.length > 0 && (
                                <div>
                                    Variant:&nbsp;
                                    <select
                                        value={item.variantId || availableVariants[0]}
                                        onChange={e => handleVariantChange(item, e.target.value)}
                                        disabled={loading}
                                    >
                                        {availableVariants.map(v => (
                                            <option value={v} key={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                Quantity:
                                <button
                                    className="px-2 py-1 border rounded"
                                    onClick={() => handleChangeQuantity(item, -1)}
                                    disabled={loading}
                                >-</button>
                                <span>{item.quantity}</span>
                                <button
                                    className="px-2 py-1 border rounded"
                                    onClick={() => handleChangeQuantity(item, 1)}
                                    disabled={loading}
                                >+</button>
                            </div>
                            <div>
                                Delivery Type:&nbsp;
                                {availableDeliveryTypes.length > 0 ? (
                                    <select
                                        value={item.chosenDeliveryType}
                                        onChange={e => handleDeliveryChange(item, e.target.value)}
                                        disabled={loading}
                                    >
                                        {availableDeliveryTypes.map(dt => (
                                            <option value={dt.type} key={dt.type}>
                                                {dt.type} {dt.price ? `($${dt.price})` : ""}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <span>No delivery available</span>
                                )}
                            </div>
                            <button
                                className="mt-2 px-3 py-1 border rounded"
                                onClick={() => handleRemove(item)}
                                disabled={loading}
                            >
                                Remove
                            </button>
                        </div>
                    );
                })}
            </div>
            {cart.length !== 0 && (
                <Link
                    href='/checkout'
                    className="mt-8 px-6 py-2 border rounded bg-accent text-white"
                >
                    Checkout
                </Link>
            )}
        </div>
    )
}

export default Cart