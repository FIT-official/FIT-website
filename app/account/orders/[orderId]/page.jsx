import OrderPage from "./OrderPage";

export async function generateMetadata(props) {
    const params = await props.params;
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/user/orders?orderId=${params.orderId}`, {
        cache: 'no-store'
    });
    const data = await res.json();
    const order = data.order;

    if (!res.ok) return { title: 'Your Order | Fix It Today®' };

    return {
        title: `${order?.name || "Order"} | Fix It Today®`,
        description: order?.description || "View your order from Fix It Today®",
        openGraph: {
            title: `${order?.name || "Order"} | Fix It Today®`,
            description: order?.description || "View your order from Fix It Today®",
            url: `https://fixitoday.com/account/orders/${params.orderId}`,
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

function OrderLayout() {
    return <OrderPage />
}

export default OrderLayout