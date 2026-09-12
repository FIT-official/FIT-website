'use client'
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { GoStar } from "react-icons/go";
import Image from "next/image";
import { useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { IoIosHeart, IoIosHeartEmpty } from "react-icons/io";
import LinkToolTip from "./LinkToolTip";
import { getDiscountedPrice } from "@/utils/discount";

function ProductCard({ product }) {
    const { user, isSignedIn, isLoaded } = useUser();
    const [liked, setLiked] = useState(user?.id ? product.likes?.includes?.(user.id) ?? false : false);
    const [likeCount, setLikeCount] = useState(product.likeCount ?? product.likes?.length ?? 0);
    const [relationship, setRelationship] = useState(null);
    const isPublicSeed = typeof product.likeCount === 'number' && !Array.isArray(product.likes);
    const viewerId = user?.id;
    const relationshipReady = !isPublicSeed || (
        !!viewerId && relationship?.viewerId === viewerId && relationship?.productId === product._id
    );
    const creatorUserId = isPublicSeed ? relationship?.creatorUserId : product.creatorUserId;
    const router = useRouter();

    useEffect(() => {
        if (!isPublicSeed) {
            setLiked(!!viewerId && (product.likes?.includes?.(viewerId) ?? false));
            setLikeCount(product.likes?.length ?? 0);
            return;
        }
        // The crawlable catalogue contains counts only. Resolve this viewer's
        // saved state in the browser before showing interactive like controls.
        setRelationship(null);
        setLiked(false);
        setLikeCount(product.likeCount);
        if (!isLoaded || !isSignedIn || !viewerId) return;
        let cancelled = false;
        const params = new URLSearchParams({ productId: product._id, fields: 'likes,creatorUserId' });
        fetch(`/api/product?${params}`)
            .then(response => response.ok ? response.json() : null)
            .then(data => {
                const details = data?.product;
                if (cancelled || !details || typeof details.creatorUserId !== 'string' || !Array.isArray(details.likes)) return;
                setRelationship({ viewerId, productId: product._id, creatorUserId: details.creatorUserId });
                setLiked(details.likes.includes(viewerId));
                setLikeCount(details.likes.length);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [isPublicSeed, isLoaded, isSignedIn, viewerId, product._id, product.likes, product.likeCount, product.creatorUserId]);

    const [tooltip, setTooltip] = useState(null);
    const [hoveringLink, setHoveringLink] = useState(false);

    const images = product.images || [];
    const primaryImageKey = images[0];
    const imageSrc = primaryImageKey
        ? `/api/proxy?key=${encodeURIComponent(primaryImageKey)}`
        : '/placeholder.jpg';

    const reviews = product.reviews || [];
    const salesCount = product.salesCount ?? product.sales?.length ?? 0;

    const isItMyProduct = (creatorId) => {
        if (!isLoaded || !user) return false;
        return creatorId === user.id;
    }

    const handleLike = async (e) => {
        e.stopPropagation();
        if (!isLoaded || !user) {
            return;
        }
        if (!isSignedIn) {
            router.push("/sign-in?redirect=/products");
            return;
        }
        setLiked(true);

        try {
            const res = await fetch(`/api/like/${product._id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, action: "like" }),
            });
            const data = await res.json();
            if (res.ok) {
                setLiked(data.liked);
                if (Number.isFinite(data.likeCount)) setLikeCount(data.likeCount);
            } else {
                setLiked(false);
            }
        } catch (err) {
            setLiked(false);
        }
    }

    const handleUnlike = async (e) => {
        e.stopPropagation();
        if (!isLoaded || !user) {
            return;
        }
        if (!isSignedIn) {
            router.push("/sign-in?redirect=/products");
            return;
        }
        setLiked(false);


        try {
            const res = await fetch(`/api/like/${product._id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, action: "unlike" }),
            });
            const data = await res.json();
            if (res.ok) {
                setLiked(data.liked);
                if (Number.isFinite(data.likeCount)) setLikeCount(data.likeCount);
            } else {
                setLiked(true);
            }
        } catch (err) {
            setLiked(true);
        }
    };

    const handleCardClick = (e) => {
        if (!hoveringLink) {
            window.open(`/products/${product.slug}`, '_blank');
        }
    };

    return (
        <div
            className="relative flex flex-col gap-3 p-4 transition-all duration-500 ease-in-out cursor-pointer"
            onMouseMove={e => {
                if (!hoveringLink) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltip({
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                    });
                }
            }}
            onMouseLeave={() => setTooltip(null)}
            onClick={handleCardClick}
            role="button"
        >
            {!hoveringLink && <LinkToolTip tooltip={tooltip} title={"View " + product.name} />}
            <Image
                src={imageSrc}
                alt={product.name}
                width={400}
                height={400}
                className="flex w-full object-cover bg-borderColor aspect-square mb-2"
            />
            <div className="flex flex-col w-full items-center justify-center relative">
                <a href={`/products/${encodeURIComponent(product.slug)}`} onClick={e => e.stopPropagation()} className="text-xs uppercase font-normal flex hover:underline">{product.name}</a>

                <p className="text-base font-bold flex items-end">
                    {(() => {
                        const basePrice = Number(product.basePrice?.presentmentAmount || 0);
                        const currency = product.basePrice?.presentmentCurrency || 'SGD';

                        // Calculate lowest possible price: base + minimum additional fees from variants
                        let minAdditionalFee = 0;
                        if (product.variantTypes && product.variantTypes.length > 0) {
                            product.variantTypes.forEach(variantType => {
                                if (variantType.options && variantType.options.length > 0) {
                                    // Find the option with the lowest additional fee
                                    const lowestFee = Math.min(...variantType.options.map(opt => opt.additionalFee || 0));
                                    minAdditionalFee += lowestFee;
                                }
                            });
                        }

                        const lowestPrice = basePrice + minAdditionalFee;

                        // Check if discount applies to the lowest price
                        const productWithLowestPrice = {
                            ...product,
                            price: {
                                presentmentAmount: lowestPrice,
                                presentmentCurrency: currency
                            }
                        };

                        const discountedPrice = getDiscountedPrice(productWithLowestPrice);

                        if (discountedPrice !== null && discountedPrice < lowestPrice) {
                            return (
                                <>
                                    <span className="flex mr-1">
                                        {currency} {discountedPrice.toFixed(2)}
                                    </span>
                                    <span className="flex text-xs text-extraLight mb-0.5 line-through">
                                        {lowestPrice.toFixed(2)}
                                    </span>
                                </>
                            );
                        }

                        // Show "From" prefix if there are variants that could increase the price
                        const hasVariablePricing = product.variantTypes && product.variantTypes.length > 0 &&
                            product.variantTypes.some(vt => vt.options?.some(opt => (opt.additionalFee || 0) > 0));

                        return `${hasVariablePricing ? 'From ' : ''}${currency} ${lowestPrice.toFixed(2)}`;
                    })()}
                </p>

                {reviews.length > 0 && (
                    <span className='flex items-center gap-2 text-lightColor text-sm'>
                        <GoStar className='inline' />
                        {reviews.reduce((acc, review) => acc + review.rating, 0) / reviews.length}
                    </span>
                )}

                <span className='flex text-xs text-lightColor'>{salesCount} sold</span>
                {relationshipReady && !isItMyProduct(creatorUserId) && (
                    <button
                        onClick={liked ? handleUnlike : handleLike}
                        className="absolute top-1 right-1 z-5 cursor-pointer"
                        aria-label={liked ? "Unlike" : "Like"}
                        title={`${likeCount} ${likeCount === 1 ? 'like' : 'likes'}`}
                        onMouseEnter={() => {
                            setHoveringLink(true);
                            setTooltip(null);
                        }}
                        onMouseLeave={() => setHoveringLink(false)}
                    >
                        <MotionConfig transition={{ duration: 0.15, ease: "easeInOut" }}>
                            <AnimatePresence mode="wait" initial={false}>
                                {liked ? (
                                    <motion.span
                                        key="liked"
                                        initial={{ scale: 0.7, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.7, opacity: 0 }}
                                    >
                                        <IoIosHeart size={16} className="text-textColor" />
                                    </motion.span>
                                ) : (
                                    <motion.span
                                        key="unliked"
                                        initial={{ scale: 0.7, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.7, opacity: 0 }}
                                    >
                                        <IoIosHeartEmpty size={16} className="text-textColor" />
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </MotionConfig>
                    </button>
                )}
            </div>
        </div>
    )
}

export default ProductCard
