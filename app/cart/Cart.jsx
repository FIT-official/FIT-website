'use client'
import React, { use, useEffect, useState } from 'react'
import { useUser } from "@clerk/nextjs"
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { GoChevronLeft } from 'react-icons/go';
import Image from 'next/image';
import { useToast } from '@/components/General/ToastProvider';
import CartSummarySkeleton from './components/CartSummarySkeleton';
import CartItemSkeleton from './components/CartItemSkeleton';
import { IoCartOutline } from 'react-icons/io5';
import { convertToGlobalCurrency } from '@/utils/convertCurrency';
import { getDiscountedPrice } from '@/utils/discount';
import { useCurrency } from '@/components/General/CurrencyContext';

function Cart() {
    const { user, isLoaded } = useUser();
    const [cart, setCart] = useState([]);
    const [cartBreakdown, setCartBreakdown] = useState([]);
    const [products, setProducts] = useState({});
    const [convertedPrices, setConvertedPrices] = useState({});
    const [loading, setLoading] = useState(true);
    const [localOrderNotes, setLocalOrderNotes] = useState({});
    const searchParams = useSearchParams();
    const redirectUrl = searchParams.get("redirect") || "/";
    const { showToast } = useToast();
    const globalCurrency = useCurrency();

    const refreshCartBreakdown = async () => {
        setLoading(true);
        const res = await fetch('/api/checkout/breakdown');
        if (res.ok) {
            const data = await res.json();
            setCartBreakdown(data.cartBreakdown || []);
        } else {
            const data = await res.json().catch(() => ({}));
            showToast(data.error, 'error');
            setCartBreakdown([]);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (!isLoaded || !user) return;
        const fetchCart = async () => {
            setLoading(true);
            const res = await fetch(`/api/user/cart`);
            const data = await res.json();
            setCart(data.cart || []);
            const productIds = (data.cart || []).map(item => item.productId);
            if (productIds.length > 0) {
                const res2 = await fetch(`/api/product?ids=${productIds.join(",")}&fields=_id,name,images,variants,discount,delivery,basePrice,variantTypes`);
                const data2 = await res2.json();
                const prodMap = {};
                (data2.products || []).forEach(p => { prodMap[p._id] = p; });
                setProducts(prodMap);
            }
            setLoading(false);
            // Fetch cart breakdown after loading cart
            if (data.cart && data.cart.length > 0) {
                refreshCartBreakdown();
            }
        };
        fetchCart();
    }, [isLoaded, user]);

    // Calculate converted prices when products or currency changes
    useEffect(() => {
        const calculateConvertedPrices = async () => {
            const newConvertedPrices = {};

            for (const productId of Object.keys(products)) {
                const product = products[productId];

                // Skip products without variants
                if (!product.variants || !Array.isArray(product.variants) || product.variants.length === 0) {
                    console.warn(`Product ${productId} has no variants, skipping price conversion`);
                    continue;
                }

                // Find the lowest variant price for conversion (as a reference)
                const lowestVariant = product.variants.reduce((lowest, variant) => {
                    const currentPrice = Number(variant.price?.presentmentAmount);
                    const lowestPrice = Number(lowest.price?.presentmentAmount);
                    return currentPrice < lowestPrice ? variant : lowest;
                });

                const price = lowestVariant.price.presentmentAmount;
                const currency = lowestVariant.price.presentmentCurrency;

                // Create a mock product with variant price for discount calculation
                const productWithVariantPrice = {
                    ...product,
                    price: {
                        presentmentAmount: price,
                        presentmentCurrency: currency
                    }
                };
                const discountedPrice = getDiscountedPrice(productWithVariantPrice);

                try {
                    const convertedPrice = await convertToGlobalCurrency(price, currency, globalCurrency);
                    const convertedDiscountedPrice = discountedPrice
                        ? await convertToGlobalCurrency(discountedPrice, currency, globalCurrency)
                        : null;

                    newConvertedPrices[productId] = {
                        price: convertedPrice,
                        discountedPrice: convertedDiscountedPrice,
                        currency: globalCurrency
                    };
                } catch (error) {
                    console.error('Error converting price for product', productId, error);
                    // Fallback to original price
                    newConvertedPrices[productId] = {
                        price: price,
                        discountedPrice: discountedPrice,
                        currency: currency
                    };
                }
            }

            setConvertedPrices(newConvertedPrices);
        };

        if (Object.keys(products).length > 0 && globalCurrency) {
            calculateConvertedPrices();
        }
    }, [products, globalCurrency]);

    const handleDeliveryChange = async (cartItem, newType) => {
        setLoading(true);
        const res = await fetch("/api/user/cart/delivery", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                productId: cartItem.productId,
                variantId: cartItem.variantId || null,
                selectedVariants: cartItem.selectedVariants || {},
                chosenDeliveryType: newType,
            }),
        });
        setLoading(false);
        if (res.ok) {
            const cartRes = await fetch(`/api/user/cart`);
            const cartData = await cartRes.json();
            setCart(cartData.cart || []);
            refreshCartBreakdown();
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
                selectedVariants: cartItem.selectedVariants || {},
            }),
        });
        setLoading(false);
        if (res.ok) {
            setCart(cart =>
                cart.filter(item => {
                    const variantsMatch = JSON.stringify(item.selectedVariants || {}) === JSON.stringify(cartItem.selectedVariants || {});
                    return !(item.productId === cartItem.productId &&
                        item.variantId === cartItem.variantId &&
                        variantsMatch);
                })
            );
            refreshCartBreakdown();
        }
    };

    const handleOrderNoteChange = (cartItem, orderNote) => {
        const variantKey = JSON.stringify(cartItem.selectedVariants || {}) || cartItem.variantId || 'default';
        setLocalOrderNotes(prevNotes => ({
            ...prevNotes,
            [`${cartItem.productId}-${variantKey}`]: orderNote,
        }));
        setCart(cart =>
            cart.map(item => {
                const variantsMatch = JSON.stringify(item.selectedVariants || {}) === JSON.stringify(cartItem.selectedVariants || {});
                return item.productId === cartItem.productId &&
                    item.variantId === cartItem.variantId &&
                    variantsMatch
                    ? { ...item, orderNote }
                    : item;
            })
        );
    };

    const submitOrderNotes = async () => {
        const notesToSubmit = Object.entries(localOrderNotes);
        for (const [key, orderNote] of notesToSubmit) {
            const [productId, variantKey] = key.split('-', 2);
            let variantId = null;
            let selectedVariants = {};

            // Try to parse as JSON (new variant system)
            try {
                selectedVariants = JSON.parse(variantKey);
            } catch (e) {
                // Fallback to legacy variant system
                variantId = variantKey === 'default' ? null : variantKey;
            }

            await fetch("/api/user/cart/note", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    productId,
                    variantId,
                    selectedVariants,
                    orderNote,
                }),
            });
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
                        selectedVariants: cartItem.selectedVariants || {},
                        chosenDeliveryType: cartItem.chosenDeliveryType,
                    }
                }),
            });
            setLoading(false);
            if (res.ok) {
                setCart(cart =>
                    cart.map(item => {
                        const variantsMatch = JSON.stringify(item.selectedVariants || {}) === JSON.stringify(cartItem.selectedVariants || {});
                        return item.productId === cartItem.productId &&
                            item.variantId === cartItem.variantId &&
                            item.chosenDeliveryType === cartItem.chosenDeliveryType &&
                            variantsMatch
                            ? { ...item, quantity: item.quantity + 1 }
                            : item;
                    })
                );
                refreshCartBreakdown();
            }
        } else if (delta === -1) {
            // For digital and printDelivery items, always remove the entire item since they should only have quantity 1
            if (cartItem.chosenDeliveryType === "digital" || cartItem.chosenDeliveryType === "printDelivery" || cartItem.quantity <= 1) {
                await handleRemove(cartItem);
                setLoading(false);
                return;
            }
            const res = await fetch("/api/user/cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cartItem: {
                        productId: cartItem.productId,
                        quantity: -1,
                        variantId: cartItem.variantId || null,
                        selectedVariants: cartItem.selectedVariants || {},
                        chosenDeliveryType: cartItem.chosenDeliveryType,
                    }
                }),
            });
            setLoading(false);
            if (res.ok) {
                setCart(cart =>
                    cart.map(item => {
                        const variantsMatch = JSON.stringify(item.selectedVariants || {}) === JSON.stringify(cartItem.selectedVariants || {});
                        return item.productId === cartItem.productId &&
                            item.variantId === cartItem.variantId &&
                            item.chosenDeliveryType === cartItem.chosenDeliveryType &&
                            variantsMatch
                            ? { ...item, quantity: item.quantity - 1 }
                            : item;
                    })
                );
                refreshCartBreakdown();
            }
        }
    };

    return (
        <div className='flex w-full flex-col min-h-[92vh] py-12 border-b border-borderColor px-8'>
            <Link href={redirectUrl} className='flex w-full items-center text-sm font-normal gap-2 toggleXbutton'>
                <GoChevronLeft /> Go Back
            </Link>
            <h2 className='flex items-center gap-2 ml-5 mb-2 mt-4 font-semibold text-3xl'>
                <IoCartOutline />
                Your Cart
            </h2>
            <div className='flex flex-col w-full py-4'>
                <div className='flex flex-col border-t border-b w-full my-6 divide-y divide-borderColor border-borderColor'>
                    {loading ? (
                        <>
                            <CartItemSkeleton />
                            <CartItemSkeleton />
                        </>
                    ) :
                        cart.length > 0 ? (
                            cart.map((cartItem, index) => {
                                const product = products[cartItem.productId];
                                if (!product) return null;

                                // Find the corresponding breakdown item for pricing
                                const breakdownItem = cartBreakdown.find(item => {
                                    if (item.productId !== cartItem.productId) return false;

                                    // For new variant system, compare selectedVariants
                                    if (cartItem.selectedVariants && typeof cartItem.selectedVariants === 'object' && Object.keys(cartItem.selectedVariants).length > 0) {
                                        return JSON.stringify(item.selectedVariants || {}) === JSON.stringify(cartItem.selectedVariants);
                                    }

                                    // For legacy system, compare variantId
                                    if (cartItem.variantId) {
                                        return item.variantId === cartItem.variantId || item.variantId?.toString() === cartItem.variantId?.toString();
                                    }

                                    // No variants - just match on productId
                                    return !item.variantId && (!item.selectedVariants || Object.keys(item.selectedVariants).length === 0);
                                });

                                return (
                                    <div key={index} className='grid grid-cols-1 md:grid-rows-1 md:grid-cols-5 gap-2 md:gap-4 py-8 md:py-6 px-6'>
                                        {/* image */}
                                        <div className='flex w-full h-full items-center justify-start'>
                                            <Image
                                                src={`/api/proxy?key=${encodeURIComponent(product.images[0])}`}
                                                alt={product.name}
                                                width={64}
                                                height={64}
                                                className='w-24 md:w-16 md:h-16 aspect-square object-cover flex'
                                            />
                                        </div>

                                        {/* details */}
                                        <div className='flex w-full items-start justify-center flex-col gap-1'>
                                            <p className='flex font-bold uppercase md:text-sm'>{product.name}</p>
                                            <div className='flex flex-col w-fit gap-0.5'>
                                                {/* Display new variant system selections */}
                                                {cartItem.selectedVariants && typeof cartItem.selectedVariants === 'object' && Object.keys(cartItem.selectedVariants).length > 0 ? (
                                                    Object.entries(cartItem.selectedVariants).map(([variantType, selectedOption]) => (
                                                        <span key={variantType} className="text-xs text-lightColor">
                                                            {variantType}: {selectedOption}
                                                        </span>
                                                    ))
                                                ) : (
                                                    /* Fallback to legacy variant system */
                                                    <span className="text-xs text-lightColor">
                                                        {product.variants && cartItem.variantId
                                                            ? (product.variants.find(v =>
                                                                v._id === cartItem.variantId || v._id?.toString() === cartItem.variantId || v === cartItem.variantId // support both object and string
                                                            )?.name || String(cartItem.variantId))
                                                            : "Default"}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* delivery */}
                                        <div className='flex items-center md:justify-center'>
                                            <select
                                                value={cartItem.chosenDeliveryType}
                                                onChange={e => handleDeliveryChange(cartItem, e.target.value)}
                                                className="py-1 px-2 rounded border border-borderColor bg-background md:text-xs text-lightColor focus:outline-none appearance-none transition-all cursor-pointer"
                                                style={{ minWidth: 80, maxWidth: 120 }}
                                                aria-label="Change delivery type"
                                                disabled={loading}
                                            >
                                                {(product.delivery?.deliveryTypes || []).map(dt => (
                                                    <option key={dt.type} value={dt.type}>
                                                        {dt.type}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* quantity */}
                                        <div className='flex items-center md:justify-center text-sm font-medium '>
                                            <div className='flex flex-row rounded border border-borderColor py-1'>
                                                <button
                                                    onClick={() => handleChangeQuantity(cartItem, 1)}
                                                    disabled={loading || cartItem.chosenDeliveryType === "digital" || cartItem.chosenDeliveryType === "printDelivery"}
                                                    className="px-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    aria-label="Increase quantity"
                                                >
                                                    +
                                                </button>
                                                <div className=''>
                                                    {cartItem.chosenDeliveryType === "digital" || cartItem.chosenDeliveryType === "printDelivery" ? 1 : cartItem.quantity}
                                                </div>
                                                <button
                                                    onClick={() => handleChangeQuantity(cartItem, -1)}
                                                    disabled={loading}
                                                    className="px-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    aria-label="Decrease quantity"
                                                >
                                                    -
                                                </button>
                                            </div>
                                        </div>

                                        {/* price */}
                                        <div className='flex flex-col justify-center items-end font-semibold md:text-sm text-base'>
                                            {breakdownItem ? (
                                                <>
                                                    <span className="font-bold">
                                                        SGD {Number(breakdownItem.price * cartItem.quantity).toFixed(2)}
                                                    </span>

                                                    <div className='text-xs md:text-[10px] text-lightColor font-medium'>
                                                        SGD {Number(breakdownItem.price).toFixed(2)} per unit
                                                    </div>
                                                </>
                                            ) : (
                                                <span className="text-lightColor">Calculating...</span>
                                            )}
                                        </div>

                                        {/* Configure Print Button for print delivery items */}
                                        {cartItem.chosenDeliveryType === "printDelivery" && (() => {
                                            const configKey = `printConfig_${cartItem.productId}_${cartItem.variantId || 'default'}`
                                            const hasConfiguration = typeof window !== 'undefined' && localStorage.getItem(configKey)

                                            return (
                                                <div className='flex flex-col md:col-span-5 mt-4 gap-2'>
                                                    <Link
                                                        href={`/editor?productId=${cartItem.productId}&variantId=${cartItem.variantId || ''}`}
                                                        className='flex items-center justify-center gap-2 px-4 py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800 transition-colors'
                                                    >
                                                        {hasConfiguration ? 'Modify Print Settings' : 'Configure Print Settings'}
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        </svg>
                                                    </Link>
                                                    {hasConfiguration && (() => {
                                                        try {
                                                            const config = JSON.parse(localStorage.getItem(configKey))
                                                            console.log('Cart loading configuration:', config)
                                                            return (
                                                                <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs">
                                                                    <div className="flex items-center gap-2 text-green-600 mb-2">
                                                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                                        </svg>
                                                                        <span className="font-medium">Print Configuration</span>
                                                                    </div>

                                                                    <div className="space-y-3 text-gray-600">


                                                                        {/* Layer Settings */}
                                                                        <div>
                                                                            <h4 className="font-semibold text-gray-800 mb-1">Layer Settings</h4>
                                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
                                                                                {config.printSettings?.layerHeight && (
                                                                                    <div>
                                                                                        <span className="font-medium">Layer Height:</span> {config.printSettings.layerHeight}mm
                                                                                    </div>
                                                                                )}
                                                                                {config.printSettings?.initialLayerHeight && (
                                                                                    <div>
                                                                                        <span className="font-medium">Initial Layer Height:</span> {config.printSettings.initialLayerHeight}mm
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        {/* Wall Settings */}
                                                                        <div>
                                                                            <h4 className="font-semibold text-gray-800 mb-1">Wall & Infill</h4>
                                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
                                                                                {config.printSettings?.wallLoops && (
                                                                                    <div>
                                                                                        <span className="font-medium">Wall Loops:</span> {config.printSettings.wallLoops}
                                                                                    </div>
                                                                                )}
                                                                                {config.printSettings?.internalSolidInfillPattern && (
                                                                                    <div>
                                                                                        <span className="font-medium">Solid Infill Pattern:</span> {config.printSettings.internalSolidInfillPattern}
                                                                                    </div>
                                                                                )}
                                                                                {config.printSettings?.sparseInfillDensity && (
                                                                                    <div>
                                                                                        <span className="font-medium">Infill Density:</span> {config.printSettings.sparseInfillDensity}%
                                                                                    </div>
                                                                                )}
                                                                                {config.printSettings?.sparseInfillPattern && (
                                                                                    <div>
                                                                                        <span className="font-medium">Infill Pattern:</span> {config.printSettings.sparseInfillPattern}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        {/* Hardware Settings */}
                                                                        <div>
                                                                            <h4 className="font-semibold text-gray-800 mb-1">Hardware</h4>
                                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
                                                                                {config.printSettings?.nozzleDiameter && (
                                                                                    <div>
                                                                                        <span className="font-medium">Nozzle Diameter:</span> {config.printSettings.nozzleDiameter}mm
                                                                                    </div>
                                                                                )}
                                                                                {config.printSettings?.printPlate && (
                                                                                    <div>
                                                                                        <span className="font-medium">Print Plate:</span> {config.printSettings.printPlate}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        {/* Support Settings */}
                                                                        <div>
                                                                            <h4 className="font-semibold text-gray-800 mb-1">Support</h4>
                                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
                                                                                {config.printSettings?.enableSupport !== undefined && (
                                                                                    <div>
                                                                                        <span className="font-medium">Support:</span> {config.printSettings.enableSupport ? 'Enabled' : 'Disabled'}
                                                                                    </div>
                                                                                )}
                                                                                {config.printSettings?.supportType && config.printSettings?.enableSupport && (
                                                                                    <div>
                                                                                        <span className="font-medium">Support Type:</span> {config.printSettings.supportType}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>



                                                                        {/* Mesh Colors */}
                                                                        {config.meshColors && Object.keys(config.meshColors).length > 0 && (
                                                                            <div>
                                                                                <h4 className="font-semibold text-gray-800 mb-1">Colors</h4>
                                                                                <div className="flex flex-wrap gap-2">
                                                                                    {Object.entries(config.meshColors).map(([meshName, color]) => (
                                                                                        <div key={meshName} className="flex items-center gap-1 bg-white px-2 py-1 rounded border">
                                                                                            <div
                                                                                                className="w-3 h-3 rounded border border-gray-300"
                                                                                                style={{ backgroundColor: color }}
                                                                                            ></div>
                                                                                            <span className="text-xs font-medium">{meshName}</span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* Configuration Date */}
                                                                        {config.submittedAt && (
                                                                            <div className="text-xs text-gray-500 pt-2 border-t border-gray-200">
                                                                                <span className="font-medium">Configured:</span> {new Date(config.submittedAt).toLocaleDateString()} at {new Date(config.submittedAt).toLocaleTimeString()}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )
                                                        } catch (e) {
                                                            return (
                                                                <div className="flex items-center gap-2 text-green-600 text-xs">
                                                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                                    </svg>
                                                                    Print settings configured
                                                                </div>
                                                            )
                                                        }
                                                    })()}
                                                </div>
                                            )
                                        })()}

                                        {/* order notes */}
                                        <div className='flex flex-col md:col-span-5 mt-4 gap-2'>
                                            <label className="text-xs font-medium text-textColor">Order Note (optional)</label>
                                            <textarea
                                                value={cartItem.orderNote || ""}
                                                onChange={(e) => handleOrderNoteChange(cartItem, e.target.value)}
                                                placeholder="Add any special instructions or notes for this item..."
                                                className="w-full p-2 text-xs border border-borderColor rounded bg-background text-textColor resize-none"
                                                rows={2}
                                                maxLength={500}
                                            />
                                            <div className="text-xs text-lightColor">
                                                {(cartItem.orderNote || "").length}/500 characters
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className='flex w-full items-center justify-center p-6 text-lightColor text-xs uppercase font-normal'>
                                No items in cart.
                            </div>
                        )
                    }

                </div>

                <div className='flex w-full justify-end mt-8'>
                    <div className='flex flex-col border border-borderColor rounded p-4 w-full md:w-fit min-w-1/2'>
                        <h2 className="font-semibold text-lg mb-4">Cart Summary</h2>
                        {loading ? (
                            <CartSummarySkeleton />
                        ) : cartBreakdown.length === 0 ? (
                            <div className="text-lightColor text-xs mb-4">No items in cart. Did you forget to update your delivery address?</div>
                        ) : (
                            (() => {
                                // Subtotal: sum of all final prices (base + variants - discount) × quantity
                                const subtotal = cartBreakdown.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
                                // Delivery fees: sum of all deliveryFee * quantity (per item)
                                const totalDeliveryFee = cartBreakdown.reduce((sum, item) => sum + ((item.deliveryFee || 0) * (item.quantity || 1)), 0);
                                // Grand total: subtotal + totalDeliveryFee
                                const grandTotal = subtotal + totalDeliveryFee;
                                const currency = cartBreakdown[0]?.currency || 'SGD';

                                // Calculate total discount applied using priceBeforeDiscount
                                const totalDiscount = cartBreakdown.reduce((sum, item) => {
                                    const discount = (item.priceBeforeDiscount || item.price) - item.price;
                                    return sum + (discount * item.quantity);
                                }, 0);

                                return (
                                    <div className="flex flex-col divide-y divide-borderColor text-xs">
                                        {/* Subtotal after all discounts */}
                                        <div className="flex justify-between font-semibold text-textColor gap-20 py-2">
                                            <span>Subtotal</span>
                                            <span className='font-medium text-textColor text-right'>{`${currency} ${subtotal.toFixed(2)}`}</span>
                                        </div>
                                        {/* Delivery fees per item */}
                                        {cartBreakdown.map((item, idx) => (
                                            <div key={idx} className="flex justify-between font-normal text-lightColor gap-20 py-2">
                                                <span>
                                                    {item.chosenDeliveryType === "digital" ? "Digital Delivery" :
                                                        item.chosenDeliveryType === "printDelivery" ? "Print Service Fee" : "Delivery Fee"} for {item.name}
                                                    {item.quantity > 1 ? ` x${item.quantity}` : ""}
                                                </span>
                                                <span className='font-medium text-textColor text-right'>
                                                    {`${currency} ${(item.deliveryFee ? item.deliveryFee * (item.quantity || 1) : 0).toFixed(2)}`}
                                                </span>
                                            </div>
                                        ))}
                                        {/* Grand Total */}
                                        <div className='py-2 flex justify-between font-bold mt-2 w-full whitespace-nowrap'>
                                            <span>Grand Total</span>
                                            <span className='text-right'>{`${currency} ${grandTotal.toFixed(2)}`}</span>
                                        </div>
                                    </div>
                                );
                            })()
                        )}
                        <Link
                            href="/checkout"
                            onClick={async (e) => {
                                e.preventDefault();
                                await submitOrderNotes();
                                window.location.href = "/checkout";
                            }}
                            className={`formBlackButton mt-4${cart.length === 0 ? " opacity-60 pointer-events-none cursor-not-allowed" : ""}`}
                            tabIndex={cart.length === 0 ? -1 : 0}
                            aria-disabled={cart.length === 0}
                        >
                            Proceed to Checkout
                        </Link>
                    </div>
                </div>
            </div>

        </div>
    )
}

export default Cart