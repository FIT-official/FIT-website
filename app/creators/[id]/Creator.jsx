'use client'

import ProductCard from "@/components/ProductCard";
import { useUser } from '@clerk/nextjs';

const isLikelyClerkUserId = (value) => typeof value === 'string' && /^user_[a-zA-Z0-9]+$/.test(value);

const sanitizeDisplayName = (value, fallback = 'Unnamed Store') => {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    if (isLikelyClerkUserId(trimmed)) return fallback;
    return trimmed;
};

function Creator({ creator, products }) {
    const { user, isLoaded } = useUser();
    const displayName = sanitizeDisplayName(creator?.displayName, 'Unnamed Store');
    const viewerUserId = isLoaded ? (user?.id ? String(user.id) : null) : null;
    const creatorUserId = creator?.id ? String(creator.id) : null;
    const isSelf = !!(viewerUserId && creatorUserId && viewerUserId === creatorUserId);
    const canMessageCreator = !!(viewerUserId && creatorUserId && !isSelf);

    const messageCreator = () => {
        if (typeof window === 'undefined') return;
        if (isSelf) return;
        window.dispatchEvent(
            new CustomEvent('fit:openCreatorChat', {
                detail: {
                    targetUserId: creator?.id,
                    displayName: sanitizeDisplayName(creator?.displayName, 'Unnamed Store'),
                    imageUrl: creator?.imageUrl || null,
                },
            })
        );
    }

    return (
        <div className="flex flex-col min-h-[92vh] w-full items-center justify-start border-b border-borderColor py-16 px-8">
            <div className="flex flex-col w-full max-w-6xl gap-10">
                <div className="flex flex-col gap-3">
                    <h3>Creator</h3>
                    <h1 className="text-left">{displayName}</h1>
                    <div className="flex flex-row items-center justify-between gap-4 flex-wrap">
                        <p className="text-sm text-lightColor max-w-xl">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                        </p>
                        {canMessageCreator && (
                            <button
                                type="button"
                                className="formBlackButton"
                                onClick={messageCreator}
                            >
                                Message creator
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    <h2 className="font-semibold text-textColor">Products</h2>
                    {Array.isArray(products) && products.length > 0 ? (
                        <div className="grid w-full lg:grid-cols-4 md:grid-cols-2 grid-cols-1 gap-6">
                            {products.map((p) => (
                                <ProductCard key={p._id || p.id} product={p} />
                            ))}
                        </div>
                    ) : (
                        <div className="flex w-full items-center justify-center border border-borderColor rounded-sm py-16 bg-white">
                            <div className="text-sm text-lightColor">No products found.</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default Creator;
