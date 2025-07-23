'use client'
import { useUser } from '@clerk/nextjs';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { GoChevronLeft, GoChevronRight, GoDownload, GoPlus, GoStar, GoStarFill } from 'react-icons/go';
import Image from 'next/image';
import { HiCubeTransparent } from 'react-icons/hi';
import dynamic from 'next/dynamic';
import SelectField from '@/components/DashboardComponents/SelectField';
import { IoMdCheckmark } from 'react-icons/io';

const ModelViewer = dynamic(() => import("@/components/3D/ModelViewer"), { ssr: false });

function ProductPage() {
    const { user, isLoaded, isSignedIn } = useUser();
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const params = useParams();
    const slug = params.slug;

    const [liked, setLiked] = useState(false);
    const [product, setProduct] = useState(null);
    const [selectedVariant, setSelectedVariant] = useState(null);
    const [isAdding, setIsAdding] = useState(false);
    const [showAdded, setShowAdded] = useState(false);
    const [isOwnProduct, setIsOwnProduct] = useState(false);
    const [selectedVariants, setSelectedVariants] = useState({}); // for product - variant mapping in cart

    const [tabIdx, setTabIdx] = useState(0);
    const [currentTab, setCurrentTab] = useState(0);

    const [totalTabs, setTotalTabs] = useState(0);
    const [displayModelUrl, setDisplayModelUrl] = useState(null);
    const containerRef = useRef(null);
    const [containerSize, setContainerSize] = useState(0);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

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

            if (data.product && data.product.variants && data.product.variants.length > 0) {
                setSelectedVariant(data.product.variants[0]);
            }
            setLoading(false);
        }
        fetchProduct();
    }, [slug]);

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
    }, [product, user, isLoaded])

    const handleAddToCart = async (product) => {
        if (isOwnProduct) {
            return;
        }

        if (!isLoaded || !user) {
            router.push("/sign-in");
            return;
        }
        setIsAdding(true);
        try {
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

            setIsAdding(false);
            setShowAdded(true);
            setTimeout(() => setShowAdded(false), 3000);
        } catch (error) {
            alert(error || "Failed to add to cart.");
        } finally {
            setIsAdding(false);
        }
    };

    const handleVariantChange = (productId, variantId) => {
        setSelectedVariants(prev => ({
            ...prev,
            [productId]: variantId,
        }));
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
            console.log("nextTab", tabIdx);
        }
    }
    const prevTab = () => {
        if (tabIdx > 0) {
            setTabIdx((prev) => (prev - 1));
            console.log("prevTab", tabIdx);
        }

    }
    const handleTabClick = (idx) => {
        setCurrentTab(() => {
            console.log("handleTabClick", idx);
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
                        <div className='flex w-full overflow-hidden'>
                            <div
                                className='flex gap-4'
                                style={{ transform: `translateX(-${tabIdx * 116}px)`, transition: 'transform 0.3s ease-in-out' }}
                            >
                                {displayModelUrl && (
                                    <button
                                        onClick={() => handleTabClick(0)}
                                        className='flex h-[100px] aspect-square border border-extraLight border-dashed bg-baseColor hover:bg-borderColor/20 text-lightColor transition-all duration-300 ease-in-out items-center rounded-sm justify-center cursor-pointer'
                                    >
                                        <HiCubeTransparent size={25} />
                                    </button>
                                )}

                                {
                                    product?.images?.map((image, idx) => (
                                        <div
                                            key={idx}
                                            className='flex h-[100px] aspect-square bg-borderColor cursor-pointer'
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
                            <p className='font-medium text-lg mb-6'>
                                {product.price?.presentmentCurrency}{" "}
                                {Number(product.price?.presentmentAmount).toFixed(2)}
                            </p>
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
                            <div className="flex uppercase font-semibold text-sm">
                                Variants
                            </div>
                            <SelectField
                                label=""
                                options={product.variants.map((variant) => ({
                                    value: variant,
                                    label: variant
                                }))}
                                value={selectedVariant || product.variants?.[0] || ""}
                                onChangeFunction={(e) => {
                                    setSelectedVariant(e.target.value);
                                    handleVariantChange(product._id, e.target.value);
                                }}
                            />
                            {!loading && product && user && product.creatorUserId !== user.id && (
                                <button
                                    className='formBlackButton gap-2 mt-2'
                                    onClick={() => handleAddToCart(product)}
                                    disabled={isAdding || showAdded}
                                >
                                    {isAdding ? (
                                        <>
                                            Adding to cart
                                            <div className='animate-spin border border-t-transparent border-lightColor h-3 w-3 rounded-full' />
                                        </>
                                    ) : showAdded ? (
                                        <>
                                            Added to cart
                                            <IoMdCheckmark size={16} className='transition-opacity duration-300' />
                                        </>
                                    ) : (
                                        <>
                                            Add to Cart
                                            <GoPlus size={16} className='inline' />
                                        </>
                                    )}
                                </button>
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
                        </>
                    )}
                </div>
            </div>
        </div >
    )
}

export default ProductPage