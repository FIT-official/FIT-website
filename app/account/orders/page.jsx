import OrdersPage from './OrdersPage';

export const metadata = {
    title: "Your Orders | Fix It Today®",
    description: "Manage your orders from Fix It Today®",
    openGraph: {
        title: "Your Orders | Fix It Today®",
        description:
            "Manage your orders from Fix It Today®",
        url: "https://fixitoday.com/account/orders",
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

function OrdersLayout() {
    return (
        <OrdersPage />
    )
}

export default OrdersLayout