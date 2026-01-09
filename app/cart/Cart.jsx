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
import CustomPrintUpload from '@/components/Cart/CustomPrintUpload';
import { HiCheck, HiExclamationCircle } from 'react-icons/hi';
import { FaRegCircleCheck } from 'react-icons/fa6';

// Helper to fetch delivery type metadata from /api/admin/settings (AppSettings)
async function fetchDeliveryTypesMeta() {
    try {
        const res = await fetch('/api/admin/settings');
        if (!res.ok) return {};
        const data = await res.json();
        const types = (data?.settings?.additionalDeliveryTypes || []).reduce((acc, dt) => {
            acc[dt.name] = dt;
            return acc;
        }, {});
        return types;
    } catch (e) {
        return {};
    }
}

function Cart() {
    const { user, isLoaded } = useUser();
    const [cart, setCart] = useState([]);
    const [cartBreakdown, setCartBreakdown] = useState([]);
    const [products, setProducts] = useState({});
    const [convertedPrices, setConvertedPrices] = useState({});
    const [loading, setLoading] = useState(true);
    const [deliveryTypesMeta, setDeliveryTypesMeta] = useState({});
    const [localOrderNotes, setLocalOrderNotes] = useState({});
    const [showAddressPrompt, setShowAddressPrompt] = useState(false);
    const [initializedCustomPrintDelivery, setInitializedCustomPrintDelivery] = useState({});
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
            setShowAddressPrompt(false); // Hide prompt if breakdown loads successfully
        } else {
            const data = await res.json().catch(() => ({}));
            // Check if error is due to missing address
            if (data.error?.includes('delivery address') || data.error?.includes('address')) {
                setShowAddressPrompt(true);
            } else {
                showToast(data.error, 'error');
            }
            setCartBreakdown([]);
        }
        setLoading(false);
    };

    // Fetch delivery type metadata on mount
    useEffect(() => {
        fetchDeliveryTypesMeta().then(setDeliveryTypesMeta);
    }, []);

    useEffect(() => {
        if (!isLoaded || !user) return;

        const maybeAddCustomRequest = async () => {
            const addCustomRequest = searchParams.get('addCustomRequest');
            if (!addCustomRequest) return;

            try {
                const res = await fetch('/api/cart/custom-print', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requestId: addCustomRequest }),
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    if (data.error) showToast(data.error, 'error');
                }
            } catch (e) {
                console.error('Error adding custom print to cart:', e);
            }
        };

        maybeAddCustomRequest().then(fetchCartData);
    }, [isLoaded, user, searchParams]);

    const fetchCartData = async () => {
        setLoading(true);
        const res = await fetch(`/api/user/cart`);
        const data = await res.json();
        setCart(data.cart || []);

        // Filter out custom print synthetic IDs and only fetch real products
        const productIds = (data.cart || [])
            .filter(item => !String(item.productId || '').startsWith('custom-print:'))
            .map(item => item.productId);

        const prodMap = {};

        // Fetch custom print base product if any custom print items exist
        const hasCustomPrint = (data.cart || []).some(item => String(item.productId || '').startsWith('custom-print:'));
        if (hasCustomPrint) {
            try {
                const customPrintRes = await fetch('/api/product/custom-print-config');
                if (customPrintRes.ok) {
                    const customPrintData = await customPrintRes.json();
                    if (customPrintData.product) {
                        // Use the real product data but keep a generic key for cart matching
                        prodMap['custom-print'] = customPrintData.product;
                    } else {
                        // Fallback to mock if not configured yet
                        prodMap['custom-print'] = {
                            _id: 'custom-print',
                            name: 'Custom 3D Print',
                            images: [],
                            basePrice: { presentmentCurrency: 'SGD', presentmentAmount: 0 },
                            delivery: {
                                deliveryTypes: [{ type: 'printDelivery', price: 0 }]
                            }
                        };
                    }
                }
            } catch (error) {
                console.error('Error fetching custom print product:', error);
                // Fallback to mock
                prodMap['custom-print'] = {
                    _id: 'custom-print',
                    name: 'Custom 3D Print',
                    images: [],
                    basePrice: { presentmentCurrency: 'SGD', presentmentAmount: 0 },
                    delivery: {
                        deliveryTypes: [{ type: 'printDelivery', price: 0 }]
                    }
                };
            }
        }

        if (productIds.length > 0) {
            const res2 = await fetch(`/api/product?ids=${productIds.join(",")}&fields=_id,name,images,variants,discount,delivery,basePrice,variantTypes`);
            const data2 = await res2.json();
            (data2.products || []).forEach(p => { prodMap[p._id] = p; });
        }

        setProducts(prodMap);
        setLoading(false);
        // Fetch cart breakdown after loading cart
        if (data.cart && data.cart.length > 0) {
            refreshCartBreakdown();
        }
    };

    // Calculate converted prices when products, breakdown or currency changes
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

                // Try to find a matching breakdown item to reuse final discounted price,
                // so it already includes any global events.
                const breakdownItem = cartBreakdown.find(b => b.productId === productId);
                const discountedPrice = breakdownItem ? breakdownItem.price : null;

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
    }, [products, cartBreakdown, globalCurrency]);

    const handleDeliveryChange = async (cartItem, newType) => {
        // Optimistically update local UI
        setCart(prev => prev.map(item => {
            const variantsMatch = JSON.stringify(item.selectedVariants || {}) === JSON.stringify(cartItem.selectedVariants || {});
            if (
                item.productId === cartItem.productId &&
                (item.variantId || null) === (cartItem.variantId || null) &&
                variantsMatch
            ) {
                return { ...item, chosenDeliveryType: newType };
            }
            return item;
        }));

        setLoading(true);
        const selectedVariantsToSend =
            cartItem.selectedVariants && typeof cartItem.selectedVariants === 'object' && Object.keys(cartItem.selectedVariants).length > 0
                ? cartItem.selectedVariants
                : null;
        const res = await fetch("/api/user/cart/delivery", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                productId: cartItem.productId,
                variantId: cartItem.variantId || null,
                selectedVariants: selectedVariantsToSend,
                chosenDeliveryType: newType,
            }),
        });
        setLoading(false);
        if (res.ok) {
            const cartRes = await fetch(`/api/user/cart`);
            const cartData = await cartRes.json();
            setCart(cartData.cart || []);
            refreshCartBreakdown();
        } else {
            // Re-sync if save failed
            try {
                const cartRes = await fetch(`/api/user/cart`);
                const cartData = await cartRes.json();
                setCart(cartData.cart || []);
            } catch (e) {
                // ignore
            }
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
            // Special handling for custom print items - remove by productId only
            if (cartItem.productId === 'custom-print-request') {
                setCart(cart => cart.filter(item => item.productId !== 'custom-print-request'));
            } else {
                setCart(cart =>
                    cart.filter(item => {
                        const variantsMatch = JSON.stringify(item.selectedVariants || {}) === JSON.stringify(cartItem.selectedVariants || {});
                        return !(item.productId === cartItem.productId &&
                            item.variantId === cartItem.variantId &&
                            variantsMatch);
                    })
                );
            }
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

    // Helper: Use only status field for pending logic
    function isCustomPrintPending(cartItem, customPrintRequest) {
        if (!customPrintRequest) return false; // Assume not pending if request not loaded
        // Pending if status is not quoted, payment_pending, paid, printing, printed, shipped, delivered
        const status = customPrintRequest.status;
        return [
            'pending_upload',
            'pending_config',
            'configured'
        ].includes(status);
    }

    // Track custom print requests for all custom print cart items
    const [customPrintRequests, setCustomPrintRequests] = useState({});

    const refreshCustomPrintRequests = async () => {
        const requests = {};
        const customPrintCartItems = cart.filter(item => String(item.productId || '').startsWith('custom-print:'));
        await Promise.all(customPrintCartItems.map(async (item) => {
            const requestId = item.customPrintRequestId || item.requestId || (item.productId || '').split(':')[1];
            if (!requestId) return;
            try {
                const res = await fetch(`/api/custom-print?requestId=${requestId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data?.request?.requestId) {
                        requests[requestId] = data.request;
                    }
                }
            } catch (e) {
                // ignore
            }
        }));
        setCustomPrintRequests(requests);
    };

    // Fetch custom print request details for all custom print cart items
    useEffect(() => {
        if (cart.some(item => String(item.productId || '').startsWith('custom-print:'))) {
            refreshCustomPrintRequests();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cart]);

    // Ensure a valid default delivery type is selected for quoted custom print items.
    // This persists the default to the cart so the <select> shows the actual selection.
    useEffect(() => {
        const customPrintCartItems = cart.filter(item => String(item.productId || '').startsWith('custom-print:'));
        for (const cartItem of customPrintCartItems) {
            const requestId = cartItem.customPrintRequestId || cartItem.requestId || (cartItem.productId || '').split(':')[1];
            if (!requestId) continue;
            if (initializedCustomPrintDelivery[requestId]) continue;

            const req = customPrintRequests[requestId];
            const availableTypes = (req?.delivery?.deliveryTypes || []).map(dt => dt.type).filter(Boolean);
            if (availableTypes.length === 0) continue;

            const current = cartItem.chosenDeliveryType || '';
            const effective = availableTypes.includes(current) ? current : availableTypes[0];
            setInitializedCustomPrintDelivery(prev => ({ ...prev, [requestId]: true }));
            if (effective && effective !== current) {
                handleDeliveryChange(cartItem, effective);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cart, customPrintRequests, initializedCustomPrintDelivery]);

    // Determine if any custom print item is pending (block checkout if so)
    const hasPendingCustomPrint = cart.some(cartItem => {
        if (!String(cartItem.productId || '').startsWith('custom-print:')) return false;
        const requestId = cartItem.customPrintRequestId || cartItem.requestId || (cartItem.productId || '').split(':')[1];
        const customPrintRequest = customPrintRequests[requestId];
        return isCustomPrintPending(cartItem, customPrintRequest);
    });

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
                                const isCustomPrint = String(cartItem.productId || '').startsWith('custom-print:');
                                const productKey = isCustomPrint ? 'custom-print' : cartItem.productId;
                                const product = products[productKey];
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

                                // For custom print, get the requestId and request details
                                let customPrintRequest = null;
                                let needsModelUpload = false;
                                let needsConfig = false;
                                let uploadedModelName = null;
                                let requestId = null;
                                if (isCustomPrint) {
                                    requestId = cartItem.customPrintRequestId || cartItem.requestId || (cartItem.productId || '').split(':')[1];
                                    customPrintRequest = customPrintRequests[requestId];

                                    const hasModel = !!(customPrintRequest?.modelFile?.s3Key && customPrintRequest?.modelFile?.originalName);
                                    const isConfigured = !!customPrintRequest?.printConfiguration?.isConfigured;

                                    needsModelUpload = !hasModel;
                                    needsConfig = hasModel && !isConfigured;
                                    uploadedModelName = hasModel ? customPrintRequest.modelFile.originalName : null;
                                }

                                return (
                                    <div key={index} className='grid grid-cols-1 md:grid-rows-1 md:grid-cols-5 gap-2 md:gap-4 py-8 md:py-6 px-6'>
                                        {isCustomPrint ? (
                                            <React.Fragment>
                                                {/* custom print display */}
                                                <div className='flex w-full h-full items-center justify-start'>
                                                    <Image
                                                        src={product.images?.[0]
                                                            ? `/api/proxy?key=${encodeURIComponent(product.images[0])}`
                                                            : '/placeholder.jpg'}
                                                        alt={product.name || 'Custom 3D Print'}
                                                        width={64}
                                                        height={64}
                                                        className='w-24 md:w-16 md:h-16 aspect-square object-cover flex'
                                                    />
                                                </div>

                                                <div className='flex w-full items-start justify-center flex-col gap-1'>
                                                    <p className='flex font-bold uppercase md:text-sm'>
                                                        {product.name || 'Custom 3D Print'}
                                                    </p>
                                                    <span className='text-xs text-lightColor'>
                                                        Request ID: <span className='font-mono'>{requestId ? requestId : 'N/A'}</span>
                                                    </span>
                                                </div>

                                                {/* Delivery selection for custom print */}
                                                {customPrintRequest?.delivery?.deliveryTypes?.length > 0 ? (
                                                    <div className='flex flex-col gap-1 md:items-center md:justify-center'>
                                                        <label className='text-[11px] font-medium text-lightColor'>Delivery option</label>
                                                        <select
                                                            value={(() => {
                                                                const availableTypes = (customPrintRequest.delivery?.deliveryTypes || []).map(dt => dt.type).filter(Boolean);
                                                                const current = cartItem.chosenDeliveryType || '';
                                                                return availableTypes.includes(current) ? current : (availableTypes[0] || '');
                                                            })()}
                                                            onChange={e => handleDeliveryChange(cartItem, e.target.value)}
                                                            className="py-1 px-2 rounded border border-borderColor bg-background md:text-xs text-lightColor focus:outline-none appearance-none transition-all cursor-pointer"
                                                            style={{ minWidth: 120, maxWidth: 160 }}
                                                            aria-label="Delivery option"
                                                            disabled={loading}
                                                        >
                                                            {customPrintRequest.delivery.deliveryTypes.map(dt => (
                                                                <option key={dt.type} value={dt.type}>
                                                                    {dt.type}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <div className='flex items-center md:justify-center text-sm font-medium '>
                                                        <div className='flex flex-row rounded border border-borderColor py-1 px-3 text-xs'>
                                                            No delivery options
                                                        </div>
                                                    </div>
                                                )}

                                                <div className='flex items-center md:justify-center text-sm font-medium '>
                                                    <div className='flex flex-row rounded border border-borderColor py-1 px-3 text-xs'>
                                                        Fixed quantity: 1
                                                    </div>
                                                </div>

                                                <div className='flex flex-col justify-center items-end font-medium md:text-sm text-base'>
                                                    {customPrintRequest?.status === 'quoted' ? (
                                                        <div className="text-right">
                                                            <span className=' text-green-600'>
                                                                SGD {Number((customPrintRequest?.basePrice || 0) + (customPrintRequest?.printFee || 0)).toFixed(2)}
                                                            </span>
                                                            <div className="text-xs text-green-600 font-medium">
                                                                Quoted
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className=' flex items-center gap-1'>
                                                            SGD {Number(breakdownItem?.price ?? cartItem.price).toFixed(2)}
                                                            <span className="relative group">
                                                                <HiExclamationCircle className="text-yellow-500 text-base cursor-pointer" />
                                                                <span className="absolute left-1/2 font-normal -translate-x-1/2 mt-2 w-64 text-xs rounded p-4 items-center justify-center text-center opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity duration-200 whitespace-normal bg-background border border-borderColor shadow-lg">
                                                                    This may not be the final price and will be affected by the final quote.<br />For help, please contact <a href="mailto:fixitoday.contact@gmail.com" className="underline">fixitoday.contact@gmail.com</a>
                                                                </span>
                                                            </span>
                                                        </span>
                                                    )}
                                                    <button
                                                        onClick={() => handleRemove(cartItem)}
                                                        className='mt-1 text-[11px] text-red-500 hover:text-red-700'
                                                    >
                                                        Remove
                                                    </button>
                                                </div>

                                                {/* Custom Print Upload/Configure Button */}
                                                <div className="md:col-span-5 mt-4">
                                                    {/* Step-by-step checklist for custom print */}
                                                    <div className="flex flex-col gap-4 p-4 bg-background border border-borderColor rounded-lg mb-4">
                                                        {/* Step 1: Upload Model */}
                                                        <div className="flex items-center gap-3">
                                                            <FaRegCircleCheck className={`text-base ${(customPrintRequest?.modelFile?.s3Key && customPrintRequest?.modelFile?.originalName) ? 'text-green-600' : 'text-extraLight'}`} />
                                                            <span className={`text-sm font-medium ${(customPrintRequest?.modelFile?.s3Key && customPrintRequest?.modelFile?.originalName) ? 'text-green-700' : 'text-extraLight'}`}>Upload 3D Model</span>
                                                        </div>
                                                        {/* Step 2: Configure Print */}
                                                        <div className="flex items-center gap-3">
                                                            <FaRegCircleCheck className={`text-base ${(customPrintRequest?.printConfiguration?.isConfigured || ['configured','quoted','payment_pending','paid','printing','printed','shipped','delivered'].includes(customPrintRequest?.status || 'pending_upload')) ? 'text-green-600' : 'text-extraLight'}`} />
                                                            <span className={`text-sm font-medium ${(customPrintRequest?.printConfiguration?.isConfigured || ['configured','quoted','payment_pending','paid','printing','printed','shipped','delivered'].includes(customPrintRequest?.status || 'pending_upload')) ? 'text-green-700' : 'text-extraLight'}`}>Configure Print Settings</span>
                                                        </div>
                                                        {/* Step 3: Await Quote */}
                                                        <div className="flex items-center gap-3">
                                                            <FaRegCircleCheck className={`text-base ${['quoted','payment_pending','paid','printing','printed','shipped','delivered'].includes(customPrintRequest?.status || 'pending_upload') ? 'text-green-600' : 'text-extraLight'}`} />
                                                            <span className={`text-sm font-medium ${['quoted','payment_pending','paid','printing','printed','shipped','delivered'].includes(customPrintRequest?.status || 'pending_upload') ? 'text-green-700' : 'text-extraLight'}`}>Await Quote</span>
                                                        </div>
                                                    </div>
                                                    {/* Show model upload or uploaded model info */}
                                                    {needsModelUpload ? (
                                                        <div className="flex flex-col gap-2">
                                                            {(!uploadedModelName) && (
                                                                <div className="flex items-center gap-2 text-yellow-600 text-xs font-medium">
                                                                    <HiExclamationCircle className="text-lg" />
                                                                    <span>
                                                                        Please upload your 3D model to proceed.
                                                                    </span>
                                                                </div>
                                                            )}
                                                            <CustomPrintUpload
                                                                cartItem={{
                                                                    ...cartItem,
                                                                    requestId: requestId,
                                                                    customPrintRequestId: cartItem.customPrintRequestId
                                                                }}
                                                                onUploadComplete={async () => {
                                                                    await refreshCartBreakdown();
                                                                    await refreshCustomPrintRequests();
                                                                }}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <CustomPrintUpload
                                                            cartItem={{
                                                                ...cartItem,
                                                                requestId: requestId,
                                                                customPrintRequestId: cartItem.customPrintRequestId
                                                            }}
                                                            onUploadComplete={async () => {
                                                                await refreshCartBreakdown();
                                                                await refreshCustomPrintRequests();
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                            </React.Fragment>
                                        ) : (
                                            <React.Fragment>
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
                                            </React.Fragment>
                                        )}
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
                        {/* Block checkout if any custom print is pending */}
                        {hasPendingCustomPrint && (
                            <div className="mb-4 rounded-lg border border-yellow-400 bg-yellow-50 p-4 flex items-center gap-3">
                                <HiExclamationCircle className="text-yellow-600 text-xl" />
                                <div>
                                    <div className="font-semibold text-yellow-800 text-sm">Custom Print Request Incomplete</div>
                                    <div className="text-xs text-yellow-700">
                                        Please upload your 3D model, configure your print request and await a quote before proceeding to checkout.
                                    </div>
                                </div>
                            </div>
                        )}
                        {loading ? (
                            <CartSummarySkeleton />
                        ) : showAddressPrompt ? (
                            <div className="mb-4 rounded-lg border border-borderColor bg-baseColor p-6 space-y-4">
                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-textColor">Delivery Address Required</h3>
                                    <p className="text-xs text-lightColor leading-relaxed">
                                        Please add your delivery address to see accurate shipping costs and proceed with checkout.
                                    </p>
                                </div>
                                <Link
                                    href="/account?tab=billing"
                                    className="block w-full px-4 py-3 bg-textColor text-background rounded-md text-sm font-medium hover:bg-textColor/90 transition-all duration-200 text-center"
                                >
                                    Add Delivery Address
                                </Link>
                            </div>
                        ) : cartBreakdown.length === 0 ? (
                            <div className="text-lightColor text-xs mb-4">No items in cart.</div>
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
                                        {cartBreakdown.map((item, idx) => {
                                            // Fetch delivery type meta from AppSettings
                                            const deliveryMeta = deliveryTypesMeta[item.chosenDeliveryType] || null;
                                            return (
                                                <div key={idx} className="flex flex-col gap-1 py-2 border-b border-borderColor last:border-b-0">
                                                    <div className="flex justify-between font-normal text-lightColor gap-20">
                                                        <span>
                                                            {deliveryMeta?.displayName || item.chosenDeliveryType || 'Delivery'} for {item.name}
                                                            {item.quantity > 1 ? ` x${item.quantity}` : ""}
                                                        </span>
                                                        <span className='font-medium text-textColor text-right'>
                                                            {`${currency} ${(item.deliveryFee ? item.deliveryFee * (item.quantity || 1) : 0).toFixed(2)}`}
                                                        </span>
                                                    </div>
                                                    {deliveryMeta && (
                                                        <div className="flex flex-col text-[11px] text-lightColor ml-1 mt-0.5">
                                                            <span><b>Type:</b> {deliveryMeta.displayName} ({deliveryMeta.name})</span>
                                                            {deliveryMeta.description && <span><b>About:</b> {deliveryMeta.description}</span>}
                                                            {deliveryMeta.hasDefaultPrice && deliveryMeta.basePricing?.basePrice != null && (
                                                                <span><b>Default Price:</b> SGD {Number(deliveryMeta.basePricing.basePrice).toFixed(2)}</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
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
                                if (hasPendingCustomPrint) {
                                    e.preventDefault();
                                    showToast('Please complete your custom print request before checking out.', 'error');
                                    return;
                                }
                                await submitOrderNotes();
                                window.location.href = "/checkout";
                            }}
                            className={`formBlackButton mt-4${cart.length === 0 || hasPendingCustomPrint ? " opacity-60 pointer-events-none cursor-not-allowed" : ""}`}
                            tabIndex={cart.length === 0 || hasPendingCustomPrint ? -1 : 0}
                            aria-disabled={cart.length === 0 || hasPendingCustomPrint}
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