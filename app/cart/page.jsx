import Cart from "./Cart";

export const metadata = {
    title: "Cart | Fix It Today®",
    description: "Manage your cart items for Fix It Today®",
    openGraph: {
        title: "Cart | Fix It Today®",
        description: "Manage your cart items for Fix It Today®",
        url: "https://fixitoday.com/cart",
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

function CartLayout() {
    return (
        <Cart />
    )
}

export default CartLayout