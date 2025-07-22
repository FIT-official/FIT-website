import ProductPage from "./ProductPage";

export async function generateMetadata({ params }) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/product?slug=${params.slug}`, {
        cache: 'no-store'
    });
    const data = await res.json();
    const product = data.product;

    return {
        title: `${product?.name || "Product"} | Fix It Today®`,
        description: product?.description || "Browse and purchase products from Fix It Today®",
    };
}

export default function ProductPageLayout() {
    return <ProductPage />;
}