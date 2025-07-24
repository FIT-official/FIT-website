import ShopPage from "./ShopPage";

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

function ShopLayout() {
    return (
        <ShopPage />
    )
}

export default ShopLayout
