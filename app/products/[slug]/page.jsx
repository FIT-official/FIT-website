import ProductPage from "./ProductPage";

export async function generateMetadata(props) {
    const { params } = await props;
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/product?slug=${params.slug}`, {
        cache: 'no-store'
    });
    const data = await res.json();
    const product = data.product;

    return {
        title: `${product?.name || "Product"} | Fix It Today®`,
        description: product?.description || "Browse and purchase products from Fix It Today®",
        openGraph: {
            title: `${product?.name || "Product"} | Fix It Today®`,
            description: product?.description || "Browse and purchase products from Fix It Today®",
            url: `https://fixitoday.com/products/${params.slug}`,
            siteName: "Fix It Today®",
            images: [
                {
                    url: product?.image || "/fitogimage.png",
                    width: 800,
                    height: 800,
                    alt: product?.name || "Fix It Today® Photo",
                },
            ],
            locale: "en_SG",
            type: "website",
        },
    };
}

export default function ProductPageLayout() {
    return <ProductPage />;
}