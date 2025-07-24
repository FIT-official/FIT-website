import CheckOut from "./CheckOut";

export const metadata = {
    title: "Checkout | Fix It Today®",
    description: "Checkout for Fix It Today®",
    openGraph: {
        title: "Checkout | Fix It Today®",
        description: "Checkout for Fix It Today®",
        url: "https://fixitoday.com/checkout",
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

function CheckoutLayout() {
    return (
        <CheckOut />
    )
}

export default CheckoutLayout