'use client'
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { GoStar } from "react-icons/go";
import Image from "next/image";
import { useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { IoIosHeart, IoIosHeartEmpty } from "react-icons/io";
import { HiCube, HiUpload } from "react-icons/hi";
import LinkToolTip from "./LinkToolTip";

function CustomPrintCard({ product }) {
    const { user, isSignedIn, isLoaded } = useUser();
    const [liked, setLiked] = useState(user?.id ? product.likes?.includes?.(user.id) ?? false : false);
    const router = useRouter();

    const [tooltip, setTooltip] = useState(null);
    const [hoveringLink, setHoveringLink] = useState(false);

    const handleLike = async (e) => {
        e.stopPropagation();
        if (!isLoaded || !user) {
            return;
        }
        if (!isSignedIn) {
            router.push("/sign-in?redirect=/prints");
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
            router.push("/sign-in?redirect=/prints");
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
            window.open(`/products/custom-print-request`, '_blank');
        }
    };

    return (
        <div
            className="relative flex flex-col gap-3 p-4 border border-dashed border-borderColor hover:border-textColor/20 rounded-lg bg-linear-to-br from-baseColor to-background transition-all duration-300 hover:shadow-lg cursor-pointer group"
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
            {!hoveringLink && <LinkToolTip tooltip={tooltip} title={"View Custom 3D Printing"} />}

            {/* Show product image if available, otherwise show icon */}
            {product?.images?.length > 0 ? (
                <Image
                    src={`/api/proxy?key=${encodeURIComponent(product.images[0])}`}
                    alt="Custom 3D Printing"
                    width={400}
                    height={400}
                    className="flex w-full object-cover bg-borderColor/30 aspect-square mb-2 rounded-lg group-hover:bg-borderColor/50 transition-colors"
                />
            ) : (
                <div className="w-full aspect-square bg-borderColor/30 rounded-lg flex flex-col items-center justify-center gap-4 group-hover:bg-borderColor/50 transition-colors mb-2">
                    <div className="relative">
                        <HiCube className="text-lightColor text-6xl group-hover:text-textColor transition-colors" />
                        <HiUpload className="absolute -bottom-2 -right-2 text-textColor text-2xl bg-background rounded-full p-1 border-2 border-borderColor" />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-medium text-textColor">Upload Your Model</p>
                        <p className="text-xs text-lightColor mt-1">Custom 3D Printing</p>
                    </div>
                </div>
            )}

            <div className="flex flex-col w-full items-center justify-center relative">
                <p className="text-xs uppercase font-normal flex">
                    {product?.name || 'Custom 3D Print'}
                </p>

                <p className="text-base font-bold flex items-end">
                    {(() => {
                        const basePrice = Number(product?.basePrice?.presentmentAmount || 0);
                        const currency = product?.basePrice?.presentmentCurrency || 'SGD';

                        if (basePrice > 0) {
                            return `From ${currency} ${basePrice.toFixed(2)}`;
                        }
                        return 'Price on request';
                    })()}
                </p>

                {product?.reviews?.length > 0 && (
                    <span className='flex items-center gap-2 text-lightColor text-sm'>
                        <GoStar className='inline' />
                        {(product.reviews.reduce((acc, review) => acc + review.rating, 0) / product.reviews.length).toFixed(1)}
                    </span>
                )}

                {product?.sales?.length > 0 && (
                    <span className='flex text-xs text-lightColor'>{product.sales.length} completed</span>
                )}

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
            </div>

            {/* "New" badge */}
            <div className="absolute top-3 right-3 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full border border-green-200">
                New
            </div>
        </div>
    )
}

export default CustomPrintCard
