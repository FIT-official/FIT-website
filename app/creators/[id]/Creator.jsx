'use client'
// Public creator page — the creator's saved blocks (or DEFAULT_BLOCKS)
// rendered through the shared BlockRenderer inside the theme frame. The
// owner gets an "Edit page" pill to the builder; an unpublished page
// reaches here only for the owner/admin (the server gates everyone else),
// so it carries a quiet "not published" notice.
import Link from "next/link";
import { useUser } from '@clerk/nextjs';
import { GoPencil, GoEyeClosed } from "react-icons/go";
import CreatorPageFrame from "@/components/CreatorPage/CreatorPageFrame";
import BlockRenderer from "@/components/CreatorPage/BlockRenderer";
import { sanitizeDisplayName } from "@/components/CreatorPage/shared";

function Creator({ creator, products, canEdit = false }) {
    const { user, isLoaded } = useUser();
    const viewerUserId = isLoaded ? (user?.id ? String(user.id) : null) : null;
    const creatorUserId = creator?.id ? String(creator.id) : null;
    const isSelf = !!(viewerUserId && creatorUserId && viewerUserId === creatorUserId);
    const showEdit = isSelf || canEdit;

    const shop = creator?.shop || {};
    const safeProducts = Array.isArray(products) ? products : [];
    const displayName = sanitizeDisplayName(creator?.displayName, 'Unnamed Store');
    const unpublished = shop.published === false;

    return (
        <CreatorPageFrame
            theme={shop.theme}
            accentColor={shop.accentColor || ''}
            className="flex flex-col min-h-[92vh] w-full items-center justify-start border-b border-borderColor py-16 px-4 md:px-8"
        >
            <div className="flex flex-col w-full max-w-6xl gap-8">
                {(showEdit || unpublished) && (
                    <div className="flex items-center gap-3 flex-wrap">
                        {unpublished && (
                            <span className="flex items-center gap-1.5 rounded-full border border-borderColor bg-baseColor px-3 py-1.5 text-xs font-medium text-lightColor">
                                <GoEyeClosed aria-hidden="true" />
                                Not published — only you can see this page
                            </span>
                        )}
                        {showEdit && (
                            <Link
                                href="/dashboard/shop"
                                className="ml-auto flex items-center gap-1.5 rounded-full border border-borderColor bg-background px-3 py-1.5 text-xs font-medium text-textColor hover:bg-baseColor transition-colors duration-300"
                            >
                                <GoPencil aria-hidden="true" />
                                Edit page
                            </Link>
                        )}
                    </div>
                )}

                <BlockRenderer
                    blocks={shop.blocks}
                    creator={{ ...creator, displayName }}
                    products={safeProducts}
                />
            </div>
        </CreatorPageFrame>
    )
}

export default Creator;
