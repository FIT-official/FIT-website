import OrderPage from "./OrderPage";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";

export async function generateMetadata(props) {
    const params = await props.params;

    try {
        const { userId } = await auth();
        if (!userId) return { title: 'Your Order | Fix It Today®' };

        await connectToDatabase();
        const user = await User.findOne({ userId }, { orderHistory: 1, _id: 0 });
        if (!user) return { title: 'Your Order | Fix It Today®' };

        const order = user.orderHistory.id(params.orderId);
        if (!order) return { title: 'Your Order | Fix It Today®' };

        return {
            title: `Order #${order._id?.toString().slice(-8) || params.orderId.slice(-8)} | Fix It Today®`,
            description: `View your order details from Fix It Today®`,
            openGraph: {
                title: `Order #${order._id?.toString().slice(-8) || params.orderId.slice(-8)} | Fix It Today®`,
                description: `View your order details from Fix It Today®`,
                url: `https://fixitoday.com/account/orders/${params.orderId}`,
                siteName: "Fix It Today®",
                images: [
                    {
                        url: order.items?.[0]?.product?.images?.[0] || "/fitogimage.png",
                        width: 800,
                        height: 800,
                        alt: "Fix It Today® Order",
                    },
                ],
                locale: "en_SG",
                type: "website",
            },
        };
    } catch (error) {
        console.error('Error generating metadata:', error);
        return { title: 'Your Order | Fix It Today®' };
    }
}

async function OrderLayout(props) {
    const params = await props.params;
    return <OrderPage orderId={params.orderId} />
}

export default OrderLayout