'use client'
import { useUser } from '@clerk/nextjs';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { GoChevronLeft, GoChevronRight, GoDownload, GoPlus, GoStar, GoStarFill } from 'react-icons/go';
import Image from 'next/image';
import Link from 'next/link';
import { HiCubeTransparent } from 'react-icons/hi';
import { BiPrinter } from 'react-icons/bi';
import dynamic from 'next/dynamic';
import { IoMdCheckmark } from 'react-icons/io';
import { getDiscountedPrice, getEffectivePercentageForRule } from '@/utils/discount';
import ReviewSection from '@/components/ProductPage/ReviewSection';

const ModelViewer = dynamic(() => import("@/components/3D/ModelViewer"), { ssr: false });

function ProductPage() {
    const { user, isLoaded, isSignedIn } = useUser();
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const params = useParams();
    const slug = params.slug;

    const [liked, setLiked] = useState(false);
    const [product, setProduct] = useState(null);
    const [selectedVariantOptions, setSelectedVariantOptions] = useState({}); // new variant types system
    const [isAdding, setIsAdding] = useState(false);
    const [showAdded, setShowAdded] = useState(false);
    const [isOwnProduct, setIsOwnProduct] = useState(false);
    const [ownsDigitalProduct, setOwnsDigitalProduct] = useState(false);
    const [checkingOwnership, setCheckingOwnership] = useState(false);
    const [isPrintAdding, setIsPrintAdding] = useState(false);
    const [showPrintAdded, setShowPrintAdded] = useState(false);

    const [tabIdx, setTabIdx] = useState(0);
    const [currentTab, setCurrentTab] = useState(0);

    const [totalTabs, setTotalTabs] = useState(0);
    const [displayModelUrl, setDisplayModelUrl] = useState(null);
    const containerRef = useRef(null);
    const [containerSize, setContainerSize] = useState(0);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [globalDiscountRules, setGlobalDiscountRules] = useState([]);

    // User orders for review eligibility
    const [userOrders, setUserOrders] = useState([]);

    useEffect(() => {
        if (!containerRef.current) return;
        const updateSize = () => {
            if (containerRef.current) {
                setContainerSize(containerRef.current.offsetWidth);
            }
        };
        updateSize();
        const resizeObserver = new window.ResizeObserver(() => {
            updateSize();
        });
        resizeObserver.observe(containerRef.current);
        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    useEffect(() => {
        async function fetchProduct() {
            setLoading(true);
            const res = await fetch(`/api/product?slug=${slug}`);

            if (!res.ok) {
                setProduct(null);
                setLoading(false);
                return;
            }
            const data = await res.json();

            setProduct(data.product);
            setLoading(false);
        }
        fetchProduct();
    }, [slug]);

    // Fetch active global events so we can reflect their effect in the
    // displayed discount percentage on the product page.
    useEffect(() => {
        const fetchGlobalEvents = async () => {
            try {
                const res = await fetch('/api/events/active');
                if (!res.ok) return;
                const data = await res.json();
                const rules = (data.events || [])
                    .filter(ev => ev.isGlobal)
                    .map(ev => ({
                        percentage: ev.percentage,
                        minimumAmount: ev.minimumPrice,
                        startDate: ev.startDate,
                        endDate: ev.endDate,
                        eventName: ev.name,
                    }));
                setGlobalDiscountRules(rules);
            } catch (e) {
                // Non-fatal for the product page; checkout still enforces globals.
                console.error('Failed to load global events for product page', e);
            }
        };

        fetchGlobalEvents();
    }, []);

    // Fetch user orders for review eligibility
    useEffect(() => {
        const fetchUserOrders = async () => {
            if (!isLoaded || !isSignedIn || !user || !product) return;

            try {
                const response = await fetch(`/api/order?userId=${user.id}&productId=${product._id}`);
                if (response.ok) {
                    const data = await response.json();
                    setUserOrders(data.orders || []);
                }
            } catch (error) {
                console.error('Error fetching user orders:', error);
            }
        };

        fetchUserOrders();
    }, [isLoaded, isSignedIn, user, product]);

    const checkDigitalOwnership = async () => {
        if (!product || !user || !isLoaded) return;

        const hasDigitalDelivery = product.delivery?.deliveryTypes?.some(dt => dt.type === 'digital');
        if (!hasDigitalDelivery) {
            setOwnsDigitalProduct(false);
            return;
        }

        setCheckingOwnership(true);
        try {
            const params = new URLSearchParams({
                productId: product._id
            });

            const res = await fetch(`/api/user/owns-product?${params}`);
            const data = await res.json();

            setOwnsDigitalProduct(data.owns || false);
        } catch (error) {
            console.error('Error checking product ownership:', error);
            setOwnsDigitalProduct(false);
        } finally {
            setCheckingOwnership(false);
        }
    };

    useEffect(() => {
        setIsOwnProduct(product?.creatorUserId === user?.id);
        setLiked(!!(product?.likes?.includes?.(user?.id)));

        if (product?.viewableModel) {
            setDisplayModelUrl("/api/proxy?key=" + encodeURIComponent(product.viewableModel));
        } else {
            setDisplayModelUrl(null);
        }

        const imagesCount = Array.isArray(product?.images) ? product.images.length : 0;
        const hasViewableModel = !!product?.viewableModel;
        setTotalTabs(imagesCount + (hasViewableModel ? 1 : 0));

        if (product && product.variantTypes && product.variantTypes.length > 0) {
            const defaultSelections = {};
            let needsUpdate = false;

            product.variantTypes.forEach(variantType => {
                const currentSelection = selectedVariantOptions[variantType.name];
                if (!currentSelection || currentSelection === '') {
                    if (variantType.options && variantType.options.length > 0) {
                        defaultSelections[variantType.name] = variantType.options[0].name;
                        needsUpdate = true;
                    }
                } else {
                    defaultSelections[variantType.name] = currentSelection;
                }
            });

            if (needsUpdate) {
                setSelectedVariantOptions(defaultSelections);
            }
        }

        checkDigitalOwnership();
    }, [product, user, isLoaded])

    const handleAddToCart = async (product) => {
        if (isOwnProduct) {
            return; 
        }

        if (!isLoaded || !user) {
            router.push("/sign-in");
            return;
        }

        // Check if this is a custom print product
        const isCustomPrint = product.slug === 'custom-print-request' || slug === 'custom-print-request'

        if (!isCustomPrint && product.variantTypes && product.variantTypes.length > 0 && !areAllVariantsSelected()) {
            alert("Please select all variant options before adding to cart.");
            return;
        }

        setIsAdding(true);
        try {
            if (isCustomPrint) {
                setIsAdding(true);
                try {
                    // 1. Create a new custom print request
                    const res = await fetch('/api/custom-print', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: user.id, userEmail: user.emailAddresses?.[0]?.emailAddress || '', userName: user.fullName || user.firstName || 'Unknown' })
                    });
                    const data = await res.json();
                    if (!res.ok || !data.requestId) {
                        throw new Error(data.error || 'Failed to create custom print request');
                    }
                    const requestId = data.requestId;

                    // 2. Add to cart with the new requestId
                    const cartRes = await fetch('/api/cart/custom-print', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ requestId })
                    });
                    if (!cartRes.ok) {
                        throw new Error('Failed to add custom print to cart');
                    }
                    setShowAdded(true);
                    setTimeout(() => setShowAdded(false), 3000);
                    router.push('/cart');
                } catch (error) {
                    alert(error.message || "Failed to add to cart.");
                } finally {
                    setIsAdding(false);
                }
                return;
            }

            const cartItem = {
                productId: product._id,
                quantity: 1,
                selectedVariants: isCustomPrint ? {} : selectedVariantOptions,
                chosenDeliveryType: product.delivery?.deliveryTypes?.[0]?.type || "selfCollect",
                isCustomPrint: isCustomPrint, // Flag for cart to show upload interface
            };

            const res = await fetch("/api/user/cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cartItem }),
            });

            setIsAdding(false);
            setShowAdded(true);
            setTimeout(() => setShowAdded(false), 3000);

            // Redirect to cart if custom print so user can upload model
            if (isCustomPrint) {
                setTimeout(() => router.push('/cart'), 1000);
            }
        } catch (error) {
            alert(error || "Failed to add to cart.");
        } finally {
            setIsAdding(false);
        }
    };

    const handleAddToPrintCart = async (product) => {
        if (isOwnProduct) {
            return;
        }

        if (!isLoaded || !user) {
            router.push("/sign-in");
            return;
        }

        // Validate variant selection for new variant types system
        if (product.variantTypes && product.variantTypes.length > 0 && !areAllVariantsSelected()) {
            alert("Please select all variant options before adding to print cart.");
            return;
        }

        setIsPrintAdding(true);
        try {
            const cartItem = {
                productId: product._id,
                quantity: 1,
                selectedVariants: selectedVariantOptions,
                chosenDeliveryType: "printDelivery",
            };

            const res = await fetch("/api/user/cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cartItem }),
            });

            setIsPrintAdding(false);
            setShowPrintAdded(true);
            setTimeout(() => setShowPrintAdded(false), 3000);
        } catch (error) {
            alert(error || "Failed to add print item to cart.");
        } finally {
            setIsPrintAdding(false);
        }
    };

    // Handle variant option selection for new variant types system
    const handleVariantOptionChange = (variantTypeName, optionName) => {
        setSelectedVariantOptions(prev => {
            const newMap = new Map(prev);
            newMap.set(variantTypeName, optionName);
            return newMap;
        });
        // Re-check ownership when variant changes
        checkDigitalOwnership();
    };

    // Function to check if all required variants are selected
    const areAllVariantsSelected = () => {
        if (!product || !product.variantTypes || product.variantTypes.length === 0) {
            return true; // No variants required - digital products with default variant only
        }

        // Check if all variant types have a valid selection
        return product.variantTypes.every(variantType => {
            const selectedOption = selectedVariantOptions[variantType.name];
            // Ensure the selected option exists in the variant type's options
            if (!selectedOption || selectedOption === '') return false;
            return variantType.options.some(opt => opt.name === selectedOption);
        });
    };

    // Function to calculate total price including selected variant fees
    const calculateTotalPrice = () => {
        if (!product) return { total: 0, currency: 'SGD', breakdown: null, discountedTotal: null, effectivePercentage: null, appliedGlobalEvents: [] };

        const basePrice = product.basePrice?.presentmentAmount || 0;
        const currency = product.basePrice?.presentmentCurrency || 'SGD';

        let additionalFees = 0;
        if (product.variantTypes && product.variantTypes.length > 0) {
            product.variantTypes.forEach(variantType => {
                const selectedOption = selectedVariantOptions[variantType.name];
                if (selectedOption) {
                    const option = variantType.options.find(opt => opt.name === selectedOption);
                    if (option) {
                        additionalFees += option.additionalFee || 0;
                    }
                }
            });
        }

        const totalPrice = basePrice + additionalFees;

        const appliedGlobalEvents = [];
        if (Array.isArray(globalDiscountRules) && globalDiscountRules.length > 0) {
            globalDiscountRules.forEach(rule => {
                const effective = getEffectivePercentageForRule(rule, totalPrice, 1);
                if (effective > 0 && rule.eventName) {
                    appliedGlobalEvents.push(rule.eventName);
                }
            });
        }

        // Always run discount engine (it will consider stacked rules) and
        // also pass in active global event rules for display parity with checkout.
        const productWithPrice = {
            ...product,
            price: { presentmentAmount: totalPrice, presentmentCurrency: currency }
        };
        const discounted = getDiscountedPrice(productWithPrice, 1, globalDiscountRules);
        const discountedTotal = discounted !== null ? discounted : null;

        let effectivePercentage = null;
        if (discountedTotal !== null && totalPrice > 0) {
            const pct = Math.round((1 - discountedTotal / totalPrice) * 100);
            if (pct > 0) {
                effectivePercentage = pct;
            }
        }

        return {
            total: totalPrice,
            currency,
            breakdown: additionalFees > 0 ? { base: basePrice, additional: additionalFees } : null,
            discountedTotal,
            effectivePercentage,
            appliedGlobalEvents,
        };
    };

    const handleViewInDownloads = () => {
        if (!user || !isLoaded) {
            router.push('/sign-in?redirect=' + encodeURIComponent('/account?tab=downloads'));
            return;
        }
        router.push('/account?tab=downloads');
    };

    const handleLike = async (e) => {
        e.stopPropagation();
        if (!isLoaded || !user || isOwnProduct) {
            return;
        }
        if (!isSignedIn) {
            router.push("/sign-in?redirect=/products");
            return;
        }
        if (!user?.id) return;

        setLiked(true);

        try {
            const res = await fetch(`/api/product/${product._id}/like`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, action: "like" }),
            });
            const data = await res.json();
            if (res.ok) {
                setLiked(data.liked);
            } else {
                setLiked(false);
            }
        } catch (err) {
            setLiked(false);
        }
    };

    const handleUnlike = async (e) => {
        e.stopPropagation();
        if (!isLoaded || !user || isOwnProduct) {
            return;
        }
        if (!isSignedIn) {
            router.push("/sign-in?redirect=/products");
            return;
        }
        setLiked(false);

        try {
            const res = await fetch(`/api/product/${product._id}/like`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, action: "unlike" }),
            });
            const data = await res.json();
            if (res.ok) {
                setLiked(data.liked);
            } else {
                setLiked(true);
            }
        } catch (err) {
            setLiked(true);
        }
    };

    const nextTab = () => {
        if (tabIdx < totalTabs - 1) {
            setTabIdx((prev) => (prev + 1));
        }
    }
    const prevTab = () => {
        if (tabIdx > 0) {
            setTabIdx((prev) => (prev - 1));
        }

    }
    const handleTabClick = (idx) => {
        setCurrentTab(() => {
            return idx;
        });
    };

    return (
        <div className='flex w-full flex-col py-20 border-b border-borderColor px-20'>
            <div className='flex lg:flex-row flex-col w-full gap-16'>
                <div className='flex flex-col lg:flex-2/5 gap-4'>
                    <div className='flex w-full overflow-hidden aspect-square' ref={containerRef}>
                        <div
                            className='flex h-full flex-row'
                            style={{
                                transform: `translateX(-${currentTab * containerSize}px)`,
                                transition: 'transform 0.3s ease-in-out'
                            }}
                        >
                            {displayModelUrl && displayModelUrl !== "/api/proxy?key=null" && (
                                <div className='relative flex aspect-square h-full bg-borderColor/20'>
                                    <div className='absolute inset-0 items-center justify-center'>
                                        <ModelViewer url={displayModelUrl} />
                                    </div>
                                </div>
                            )}
                            {product?.images?.map((image, idx) => (
                                <div key={idx} className='flex aspect-square h-full'>
                                    <Image
                                        src={`/api/proxy?key=${encodeURIComponent(image)}`}
                                        alt={`Product Image`}
                                        priority
                                        width={500}
                                        height={500}
                                        className='w-full h-full object-cover'
                                    />
                                </div>
                            ))}
                        </div>

                    </div>
                    <div className='flex w-full py-4 gap-4 items-center'>
                        <button
                            onClick={prevTab}
                            disabled={tabIdx === 0}
                            className='toggleXbutton'
                        >
                            <GoChevronLeft size={20} />
                        </button>
                        <div className='flex w-full max-w-83 overflow-hidden'>
                            <div
                                className='flex gap-4'
                                style={{ transform: `translateX(-${tabIdx * 116}px)`, transition: 'transform 0.3s ease-in-out' }}
                            >
                                {displayModelUrl && (
                                    <button
                                        onClick={() => handleTabClick(0)}
                                        className='flex h-25 aspect-square border border-extraLight border-dashed bg-baseColor hover:bg-borderColor/20 text-lightColor transition-all duration-300 ease-in-out items-center rounded-sm justify-center cursor-pointer'
                                    >
                                        <HiCubeTransparent size={25} />
                                    </button>
                                )}

                                {
                                    product?.images?.map((image, idx) => (
                                        <div
                                            key={idx}
                                            className='flex h-25 aspect-square bg-borderColor cursor-pointer'
                                            onClick={() => handleTabClick(idx + (displayModelUrl ? 1 : 0))}
                                        >
                                            <Image
                                                src={`/api/proxy?key=${encodeURIComponent(image)}`}
                                                alt={`Product Image ${idx + 1}`}
                                                width={100}
                                                height={100}
                                                className='w-full h-full object-cover'

                                            />
                                        </div>
                                    ))
                                }
                            </div>
                        </div>
                        <button
                            onClick={nextTab}
                            disabled={tabIdx >= totalTabs}
                            className='toggleXbutton'
                        >
                            <GoChevronRight size={20} />
                        </button>
                    </div>
                </div>
                <div className='flex lg:flex-3/5 flex-col px-6 py-4 gap-2'>
                    {loading || !product ? (
                        <div className="animate-pulse">
                            <div className="h-8 w-2/3 bg-borderColor rounded mb-4" />
                            <div className="h-6 w-1/4 bg-borderColor rounded mb-8" />
                            <div className="flex flex-col w-full justify-center  mt-4">
                                <div className="h-4 w-1/6 bg-borderColor rounded mb-2" />
                                <div className="h-3 w-full bg-borderColor rounded mb-1" />
                                <div className="h-3 w-5/6 bg-borderColor rounded mb-1" />
                                <div className="h-3 w-2/3 bg-borderColor rounded" />
                            </div>
                        </div>
                    ) : (
                        <>
                            <h1>{product.name}</h1>
                            {!!product?.creatorUserId && (
                                <Link
                                    href={`/creators/${encodeURIComponent(product?.creatorSlug || product.creatorUserId)}`}
                                    className='flex w-fit items-center gap-1 uppercase font-light underline text-lightColor'
                                >
                                    see shop
                                    <GoChevronRight size={14} />
                                </Link>
                            )}
                            <div className='font-medium text-lg mb-6'>
                                {(() => {
                                    const priceInfo = calculateTotalPrice();

                                    if (priceInfo.discountedTotal !== null) {
                                        // Show discounted price with strikethrough and combined effective % off
                                        return (
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-red-600">{priceInfo.currency} {priceInfo.discountedTotal.toFixed(2)}</span>
                                                    <span className="text-lightColor line-through text-base">{priceInfo.currency} {priceInfo.total.toFixed(2)}</span>
                                                    {priceInfo.effectivePercentage != null && (
                                                        <span className="text-xs bg-red-600 text-white px-2 py-1 rounded">
                                                            -{priceInfo.effectivePercentage}% OFF
                                                        </span>
                                                    )}
                                                </div>
                                                {priceInfo.appliedGlobalEvents && priceInfo.appliedGlobalEvents.length > 0 && (
                                                    <span className="text-xs text-lightColor">
                                                        Includes global event{priceInfo.appliedGlobalEvents.length > 1 ? 's' : ''}: {priceInfo.appliedGlobalEvents.join(', ')}
                                                    </span>
                                                )}
                                                {priceInfo.breakdown && (
                                                    <span className="text-sm text-lightColor">
                                                        (Base: {priceInfo.currency} {priceInfo.breakdown.base.toFixed(2)} + {priceInfo.currency} {priceInfo.breakdown.additional.toFixed(2)})
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    }

                                    // No discount, show regular price with breakdown if applicable
                                    return (
                                        <div className="flex flex-col gap-1">
                                            <span className="font-bold">{priceInfo.currency} {priceInfo.total.toFixed(2)}</span>
                                            {priceInfo.breakdown && (
                                                <span className="text-sm text-lightColor">
                                                    (Base: {priceInfo.currency} {priceInfo.breakdown.base.toFixed(2)} + {priceInfo.currency} {priceInfo.breakdown.additional.toFixed(2)})
                                                </span>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                            <div className="flex flex-col w-full justify-center mb-4 bg-borderColor/20 p-4">
                                <div className="flex uppercase font-semibold text-sm">
                                    Description
                                </div>
                                <div
                                    className={`w-full text-pretty text-sm mt-2 mb-3 overflow-hidden transition-all duration-500 ease-in-out ${isDescriptionExpanded ? "" : "line-clamp-3"
                                        }`}
                                >
                                    {product.description || "No description available for this product."}
                                </div>

                                {product.description && (
                                    <button
                                        onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                                        className="text-lightColor text-xs mt-2 self-start hover:underline focus:outline-none"
                                    >
                                        {isDescriptionExpanded ? "See less" : "See more"}
                                    </button>
                                )}

                            </div>
                            {/* Variant types system - only for products with additional variant options */}
                            {product.variantTypes && product.variantTypes.length > 0 && (
                                <div className="flex flex-col gap-4">
                                    {product.variantTypes.map((variantType) => (
                                        <div key={variantType._id} className="flex flex-col gap-2">
                                            <div className="flex uppercase font-semibold text-sm">
                                                {variantType.name}
                                            </div>
                                            <select
                                                className="w-full p-3 border border-borderColor rounded-md bg-background text-textColor focus:outline-none focus:border-gray-400"
                                                value={selectedVariantOptions[variantType.name] || (variantType.options[0]?.name || '')}
                                                onChange={(e) => {
                                                    setSelectedVariantOptions(prev => ({
                                                        ...prev,
                                                        [variantType.name]: e.target.value
                                                    }));
                                                }}
                                            >
                                                {variantType.options.map((option) => (
                                                    <option key={option._id} value={option.name}>
                                                        {option.name} {option.additionalFee > 0 && `(+${product.basePrice?.presentmentCurrency || 'SGD'} ${option.additionalFee.toFixed(2)})`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {!loading && product && user && product.creatorUserId !== user.id && (
                                <div className="flex flex-col gap-2 mt-2">
                                    {ownsDigitalProduct ? (
                                        <button
                                            className='formBlackButton gap-2 bg-green-600 hover:bg-green-700'
                                            onClick={handleViewInDownloads}
                                        >
                                            <>
                                                View in Downloads
                                                <GoDownload size={16} className='inline' />
                                            </>
                                        </button>
                                    ) : (
                                        <button
                                            className='formBlackButton gap-2'
                                            onClick={() => handleAddToCart(product)}
                                            disabled={isAdding || showAdded || checkingOwnership || !areAllVariantsSelected()}
                                        >
                                            {checkingOwnership ? (
                                                <>
                                                    Checking availability
                                                    <div className='animate-spin border border-t-transparent border-lightColor h-3 w-3 rounded-full' />
                                                </>
                                            ) : isAdding ? (
                                                <>
                                                    Adding to cart
                                                    <div className='animate-spin border border-t-transparent border-lightColor h-3 w-3 rounded-full' />
                                                </>
                                            ) : showAdded ? (
                                                <>
                                                    Added to cart
                                                    <IoMdCheckmark size={16} className='transition-opacity duration-300' />
                                                </>
                                            ) : !areAllVariantsSelected() ? (
                                                <>
                                                    Select all options
                                                    <GoPlus size={16} className='inline opacity-50' />
                                                </>
                                            ) : (
                                                <>
                                                    Add to Cart
                                                    <GoPlus size={16} className='inline' />
                                                </>
                                            )}
                                        </button>
                                    )}                                    {/* Print Button - only show if product has a 3D model */}
                                    {/* Only show print order button if NOT digital-only product */}
                                    {product.viewableModel && !(
                                        Array.isArray(product.delivery?.deliveryTypes) &&
                                        product.delivery.deliveryTypes.length === 1 &&
                                        product.delivery.deliveryTypes[0]?.type === 'digital'
                                    ) && (
                                        <button
                                            className='flex items-center justify-center gap-2 px-4 py-2 border border-borderColor text-sm font-medium rounded hover:bg-borderColor/10 transition-colors'
                                            onClick={() => handleAddToPrintCart(product)}
                                            disabled={isPrintAdding || showPrintAdded || !areAllVariantsSelected()}
                                        >
                                            {isPrintAdding ? (
                                                <>
                                                    Creating print order
                                                    <div className='animate-spin border border-t-transparent border-current h-3 w-3 rounded-full' />
                                                </>
                                            ) : showPrintAdded ? (
                                                <>
                                                    Print order created
                                                    <IoMdCheckmark size={16} className='transition-opacity duration-300' />
                                                </>
                                            ) : !areAllVariantsSelected() ? (
                                                <>
                                                    Select all options
                                                    <BiPrinter size={16} className='inline opacity-50' />
                                                </>
                                            ) : (
                                                <>
                                                    Order Print
                                                    <BiPrinter size={16} className='inline' />
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* {totalAssets > 0 && (
                                <>
                                    <div className="flex uppercase font-semibold text-sm mt-6">
                                        Free Downloadable Assets
                                    </div>
                                    <div className='flex w-full justify-between gap-2 items-center'>
                                        <button
                                            onClick={prevAsset}
                                            className='toggleXbutton'
                                        >
                                            <GoChevronLeft size={20} />
                                        </button>
                                        <div className='p-2 w-full flex overflow-x-hidden'>
                                            <div
                                                className='flex gap-2'
                                                style={{ transform: `translateX(-${currentAssetIdx * 92}px)`, transition: 'transform 0.3s ease-in-out' }}
                                            >
                                                {product.downloadableAssets.map((asset, idx) => (
                                                    <div
                                                        key={idx}
                                                        className='flex h-[84px] aspect-square items-center justify-center flex-col border border-borderColor text-lightColor text-sm gap-1 cursor-pointer hover:bg-borderColor/10 transition'
                                                        onClick={() => downloadAsset(asset)}
                                                    >
                                                        <GoDownload size={20} />
                                                        {getExtension(asset)}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <button
                                            onClick={nextAsset}
                                            className='toggleXbutton'
                                        >
                                            <GoChevronRight size={20} />
                                        </button>
                                    </div>
                                </>
                            )} */}


                            <div className="flex uppercase font-semibold text-sm mt-4">
                                Rating & Reviews
                            </div>
                            <div className='flex w-full flex-col'>
                                <div className='flex w-full'>
                                    <div className='flex flex-col items-center justify-center p-4 md:p-8 gap-4'>
                                        <div className='font-medium flex text-6xl items-end'>
                                            {Number(product.reviews?.reduce((acc, review) => acc + (review.rating || 0), 0) / product.reviews?.length || 5).toFixed(1)}
                                            <span className='flex text-extraLight text-lg ml-1 font-normal'>/5</span>
                                        </div>

                                        <div className="flex text-lightColor text-sm font-normal">
                                            ({product.reviews?.length || 0} {product.reviews?.length === 1 ? "Review" : "Reviews"})
                                        </div>
                                    </div>
                                    <div className='flex flex-col gap-1 py-8 w-full'>
                                        {[5, 4, 3, 2, 1].map((star) => {
                                            const count = product.reviews?.filter(r => r.rating === star).length || 0;
                                            const total = product.reviews?.length || 0;
                                            const percent = total ? (count / total) * 100 : 0;
                                            return (
                                                <div key={star} className='flex items-center font-medium gap-1 w-full'>
                                                    <GoStarFill size={16} /> {star}
                                                    <div className='ml-2 w-full flex items-center bg-borderColor/40 rounded-full overflow-hidden'>
                                                        <div
                                                            className='h-3 rounded bg-yellow-400 transition-all duration-300'
                                                            style={{
                                                                width: `${percent}%`,
                                                                minWidth: count > 0 ? '12px' : 0,
                                                                opacity: count > 0 ? 1 : 0.2,
                                                            }}
                                                        />

                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Reviews Section */}
                            {product && (
                                <div className="mt-8 pt-8 border-t border-borderColor">
                                    <ReviewSection product={product} userOrders={userOrders} />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div >
    )
}

export default ProductPage