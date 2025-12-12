import Blog from "./Blog";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://fixitoday.com";

export const metadata = {
    title: "Blog | Fix It Today®",
    description: "Blog for Fix It Today®",
    openGraph: {
        title: "Blog | Fix It Today®",
        description: "Check out our Fix It Today® blog for the latest updates and stories.",
        url: "https://fixitoday.com/blog",
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

const BLOG_INDEX_JSON_LD = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Fix It Today® Blog",
    description: "Check out our Fix It Today® blog for the latest updates and stories.",
    url: `${BASE_URL}/blog`,
    publisher: {
        "@type": "Organization",
        name: "Fix It Today®",
        url: BASE_URL,
    },
};

function BlogLayout() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_INDEX_JSON_LD) }}
            />
            <Blog />
        </>
    )
}

export default BlogLayout