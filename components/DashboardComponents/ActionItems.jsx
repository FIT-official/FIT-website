'use client'
import Indicator from "@/components/DashboardComponents/Indicator";
import { useEffect, useState } from "react";
import { AiOutlineExclamationCircle } from "react-icons/ai";

function ActionItems({ user, myProducts }) {
    const [matchedOrders, setMatchedOrders] = useState([]);

    useEffect(() => {
        if (!user || myProducts.length === 0) return;

        const fetchOrders = async () => {
            const productIds = myProducts.map(p => p._id);
            const res = await fetch("/api/user/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ productIds }),
            });
            const users = await res.json();

            const myProductMap = Object.fromEntries(myProducts.map(p => [p._id, p.name]));
            const results = [];
            users.forEach(u => {
                u.orderHistory.forEach(order => {
                    const item = order.cartItem;
                    if (productIds.includes(item.productId)) {
                        results.push({
                            productId: item.productId,
                            productName: myProductMap[item.productId],
                            buyerId: u.userId,
                            buyerFirstName: u.firstName,
                            buyerEmail: u.emailAddresses?.[0]?.emailAddress,
                            orderStatus: order.status,
                            quantity: item.quantity,
                            orderedAt: order.createdAt,
                        });
                    }
                });
            });
            setMatchedOrders(results);
        };
        fetchOrders();
    }, [user, myProducts]);


    return (
        <div className="col-span-4 lg:col-span-1 row-span-1 px-6 py-2 flex flex-col">
            <div className="flex items-center font-medium text-lg">
                <AiOutlineExclamationCircle className="mr-2" />
                Requires Action
            </div>
            <div className="flex border-t border-borderColor w-full h-0 my-2" />
            {matchedOrders.length === 0 && (
                <div className="dashboardActionItem text-lightColor">No actions required.</div>
            )}

            {matchedOrders.map((order, idx) => {
                let indicatorType = 0;
                if (order.orderStatus === "pending") indicatorType = 1;
                else if (order.orderStatus === "cancelled") indicatorType = 2;
                else if (order.orderStatus === "shipped") indicatorType = 0;

                const recipient = order.buyerFirstName || order.buyerEmail || "Unknown";

                return (
                    <div className="dashboardActionItem" key={order.productId + order.buyerId + order.orderedAt + idx}>
                        <Indicator type={indicatorType} />
                        <div className="w-full truncate text-sm font-normal">
                            Ship {order.productName} to {recipient}
                        </div>
                    </div>
                );
            })}
        </div>
    )
}

export default ActionItems