import { jsonLdString } from '@/lib/jsonLd'
import ShopPage from "./ShopPage";
import Link from 'next/link';
import { SITE_URL } from '@/lib/seo/site';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { getShopProducts } from '@/lib/seo/shop';
import { fixtureMode } from '@/lib/creatorDashboard/flags';

export const dynamic = 'force-dynamic';
const BASE_URL = SITE_URL;
const title = '3D Printing Filament & Electronics Singapore | Fix It Today';
const description = 'Shop 3D printing filament, ESP32 boards, sensors and electronics in Singapore. Check product details, available options and current prices at Fix It Today.';

export const metadata = buildPageMetadata({
    title,
    description,
    path: '/shop',
    imageAlt: 'Fix It Today',
});

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
    const fixture = fixtureMode();
    const products = fixture ? (await import('@/lib/creatorDashboard/preview/catalog')).previewCatalogue : await getShopProducts(params);
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: jsonLdString(SHOP_JSON_LD) }}
            />
            <section className="px-8 pt-12 pb-6">
                {fixture && <p className="text-xs text-lightColor mb-4">Local catalogue sample · representative filament artwork · no live stock</p>}
                <h1 className="text-2xl md:text-3xl mb-4">3D Printing Filament and Electronics in Singapore</h1>
                <p className="text-sm max-w-3xl mb-4">Browse PLA and PETG filament, microcontrollers, sensors and other electronics for your projects. Check each product for its specifications, available options and current price.</p>
                <div className="flex flex-wrap gap-4 text-sm underline">
                    <Link href="/shop">All shop products</Link>
                    <Link href="/shop/bulk-filament">Bulk filament enquiry</Link>
                    <Link href="/shop?productCategory=Filament">Filament</Link>
                    <Link href="/shop?productCategory=Electronics">Electronics</Link>
                    <Link href="/blog/3d-printing-filament-types-guide">Compare PLA, PETG and other materials</Link>
                    <Link href="/printer-repair">3D printer repair and maintenance</Link>
                </div>
            </section>
            <ShopPage initialProducts={products} />
        </>
    )
}

export default ShopLayout
