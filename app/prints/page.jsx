import { jsonLdString } from '@/lib/jsonLd'
import PrintPage from "./PrintPage";
import Link from 'next/link';
import { SITE_URL, absoluteUrl } from '@/lib/seo/site';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { getPrintProducts } from '@/lib/seo/shop';

export const dynamic = 'force-dynamic';

const title = '3D Printing Singapore | Models & Custom Prints | Fix It Today';
const description = 'Browse 3D models or upload your own STL, OBJ or 3MF file for a custom print in Singapore. Choose print options or get help with a new design.';

export const metadata = buildPageMetadata({ title, description, path: '/prints', imageAlt: 'Fix It Today' });

const PRINTS_JSON_LD = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: absoluteUrl('/prints'),
    isPartOf: {
        "@type": "WebSite",
        url: SITE_URL,
    },
};

async function PrintLayout({ searchParams } = {}) {
    const products = await getPrintProducts(await searchParams || {});
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: jsonLdString(PRINTS_JSON_LD) }}
            />
            <section className="px-8 pt-12 pb-6">
                <h1 className="text-2xl md:text-3xl mb-4">3D Printing in Singapore</h1>
                <p className="text-sm max-w-3xl mb-4">Upload your own model for a custom print, or browse the available designs. If you need a part drawn first, we can help with the 3D design.</p>
                <div className="flex flex-wrap gap-4 text-sm underline">
                    <Link href="/prints/request">Upload a model for printing</Link>
                    <Link href="/3d-design-printing">3D design and printing services</Link>
                    <Link href="/research-fabrication">Parts for research and business</Link>
                </div>
            </section>
            <PrintPage initialProducts={products} />
        </>
    )
}

export default PrintLayout
