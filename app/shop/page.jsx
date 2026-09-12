import { jsonLdString } from '@/lib/jsonLd'
import ShopPage from "./ShopPage";
import Link from 'next/link';
import { SITE_URL, absoluteUrl } from '@/lib/seo/site';
import { getShopProducts } from '@/lib/seo/shop';

const BASE_URL = SITE_URL;
const title = '3D Printing Filament Singapore | PLA & PETG | Fix It Today';
const description = 'Shop PLA, PETG and specialty 3D printing filament in Singapore. Compare materials, spool options and current prices from Fix It Today.';

export const metadata = {
    title,
    description,
    alternates: { canonical: absoluteUrl('/shop') },
    openGraph: {
        title,
        description,
        url: absoluteUrl('/shop'),
        siteName: "Fix It Today®",
        images: [
            {
                url: "/fitogimage.png",
                width: 800,
                height: 800,
                alt: "Fix It Today® Photo",
            },
        ],
        locale: "en_SG",
        type: "website",
    },
};

const SHOP_JSON_LD = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: `${BASE_URL}/shop`,
    isPartOf: {
        "@type": "WebSite",
        url: BASE_URL,
    },
};

async function ShopLayout({ searchParams }) {
    const params = await searchParams || {};
    const products = await getShopProducts(params);
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: jsonLdString(SHOP_JSON_LD) }}
            />
            <section className="px-8 pt-12 pb-6">
                <h1 className="text-2xl md:text-3xl mb-4">3D Printing Filament in Singapore</h1>
                <p className="text-sm max-w-3xl mb-4">Browse PLA for everyday prints, PETG for practical parts, and specialty filament for different surface finishes. Check each product for its material, spool format, colours and current price.</p>
                <div className="flex flex-wrap gap-4 text-sm underline">
                    <Link href="/shop">All shop products</Link>
                    <Link href="/shop?productCategory=Filament">Filament</Link>
                    <Link href="/blog/3d-printing-filament-types-guide">Compare PLA, PETG and other materials</Link>
                    <Link href="/blog/3d-printer-repair">3D printer repair and maintenance</Link>
                </div>
            </section>
            <ShopPage initialProducts={products} />
        </>
    )
}

export default ShopLayout
