import ProductPage from "./ProductPage";

export async function generateMetadata(props) {
    const params = await props.params;
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/product?slug=${params.slug}`, {
        cache: 'no-store'
    });
    const data = await res.json();
    const product = data.product;

    if (!res.ok) return { title: 'Product | Fix It Today®' };

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

export default async function ProductPageLayout(props) {
    const params = await props.params;

    let product = null;
    try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/product?slug=${params.slug}`, {
            cache: 'no-store'
        });

        if (res.ok) {
            const data = await res.json();
            product = data.product;
        }
    } catch (e) {
        // fail silently for JSON-LD if product fetch fails; page still renders via client
        product = null;
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://fixitoday.com';
    const productUrl = `${baseUrl}/products/${params.slug}`;

    let imageUrl = `${baseUrl}/fitogimage.png`;
    if (product?.images && product.images.length > 0) {
        const primary = product.images[0];
        imageUrl = primary.startsWith('http') || primary.startsWith('/')
            ? primary
            : `${baseUrl}/api/proxy?key=${encodeURIComponent(primary)}`;
    } else if (product?.image) {
        const primary = product.image;
        imageUrl = primary.startsWith('http') || primary.startsWith('/')
            ? primary
            : `${baseUrl}/api/proxy?key=${encodeURIComponent(primary)}`;
    }

    let aggregateRating;
    if (product?.reviews && product.reviews.length > 0) {
        const total = product.reviews.reduce((sum, review) => sum + (review.rating || 0), 0);
        const avg = total / product.reviews.length;
        aggregateRating = {
            "@type": "AggregateRating",
            ratingValue: Number.isFinite(avg) ? avg.toFixed(1) : undefined,
            reviewCount: product.reviews.length,
        };
    }

    const jsonLd = product
        ? {
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            description: product.description,
            image: [imageUrl],
            sku: product._id,
            url: productUrl,
            brand: {
                "@type": "Brand",
                name: "Fix It Today®",
            },
            offers: {
                "@type": "Offer",
                priceCurrency: product.basePrice?.presentmentCurrency || 'SGD',
                price: product.basePrice?.presentmentAmount,
                availability: product.stock > 0
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/OutOfStock',
                url: productUrl,
            },
            aggregateRating,
        }
        : null;

    return (
        <>
            {jsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
            )}
            <ProductPage />
        </>
    );
}