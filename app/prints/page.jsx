import PrintPage from "./PrintPage";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://fixitoday.com";

export const metadata = {
    title: "Print | Fix It Today®",
    description: "Browse and purchase print products from Fix It Today®",
    openGraph: {
        title: "Print | Fix It Today®",
        description: "Browse and purchase print products from Fix It Today®",
        url: "https://fixitoday.com/prints",
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

const PRINTS_JSON_LD = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Print | Fix It Today®",
    description: "Browse and purchase print products from Fix It Today®",
    url: `${BASE_URL}/prints`,
    isPartOf: {
        "@type": "WebSite",
        url: BASE_URL,
    },
};

function PrintLayout() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(PRINTS_JSON_LD) }}
            />
            <PrintPage />
        </>
    )
}

export default PrintLayout
