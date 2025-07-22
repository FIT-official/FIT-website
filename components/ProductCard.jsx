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
    const [likeCount, setLikeCount] = useState(product.likes?.length ?? 0);
    const router = useRouter();

    const [tooltip, setTooltip] = useState(null);
    const [hoveringLink, setHoveringLink] = useState(false);

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
                src={`/api/proxy?key=${encodeURIComponent(product.images[0])}`}
                alt={product.name}
                width={400}
                height={400}
                className="flex w-full object-cover bg-borderColor aspect-square mb-2"
            />
            <div className="flex flex-col w-full items-center justify-center relative">
                <p className="text-xs uppercase font-normal flex">{product.name}</p>

                <p className="text-base font-bold flex items-end">
                    {(() => {
                        const discounted = getDiscountedPrice(product);
                        if (discounted !== null) {
                            return (
                                <>

                                    <span className="flex mr-1">
                                        {product.price?.presentmentCurrency} {discounted.toFixed(2)}
                                    </span>
                                    <span className="flex text-xs text-extraLight mb-0.5 line-through">
                                        {Number(product.price?.presentmentAmount).toFixed(2)}
                                    </span>
                                </>
                            );
                        }
                        return (
                            <>
                                {product.price?.presentmentCurrency} {Number(product.price?.presentmentAmount).toFixed(2)}
                            </>
                        );
                    })()}
                </p>

                {product.reviews.length > 0 && (
                    <span className='flex items-center gap-2 text-lightColor text-sm'>
                        <GoStar className='inline' />
                        {product.reviews.reduce((acc, review) => acc + review.rating, 0) / product.reviews.length}
                    </span>
                )}

                <span className='flex text-xs text-lightColor'>{product.sales.length} sold</span>
                {isItMyProduct(product.creatorId) && (
                    <button
                        onClick={liked ? handleUnlike : handleLike}
                        className="absolute top-1 right-1 z-5 cursor-pointer"
                        aria-label={liked ? "Unlike" : "Like"}
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