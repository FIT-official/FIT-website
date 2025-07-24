import Return from "./Return";

export const metadata = {
    title: "Checkout Return | Fix It Today®",
    description: "Checkout return page for Fix It Today®",
    openGraph: {
        title: "Checkout Return | Fix It Today®",
        description: "Checkout return page for Fix It Today®",
        url: "https://fixitoday.com/checkout/return",
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

function ReturnLayout() {
    return (
        <Return />
    )
}

export default ReturnLayout