import ShopPage from "./ShopPage";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://fixitoday.com";

export const metadata = {
    title: "Shop | Fix It Today®",
    description: "Browse and purchase shop products from Fix It Today®",
    openGraph: {
        title: "Shop | Fix It Today®",
        description: "Browse and purchase shop products from Fix It Today®",
        url: "https://fixitoday.com/shop",
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
    name: "Shop | Fix It Today®",
    description: "Browse and purchase shop products from Fix It Today®",
    url: `${BASE_URL}/shop`,
    isPartOf: {
        "@type": "WebSite",
        url: BASE_URL,
    },
};

function ShopLayout() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(SHOP_JSON_LD) }}
            />
            <ShopPage />
        </>
    )
}

export default ShopLayout
