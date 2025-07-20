'use client'
import Indicator from "@/components/DashboardComponents/Indicator";
import { useEffect, useState } from "react";
import { AiOutlineExclamationCircle } from "react-icons/ai";
import { useToast } from "../General/ToastProvider";
import { IoMdClose } from "react-icons/io";

function ActionItems({ user, myProducts }) {
    const [matchedOrders, setMatchedOrders] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [updating, setUpdating] = useState(false);
    const { showToast } = useToast();

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
                            buyerFirstName: u.firstName || "",
                            buyerEmail: u.emailAddresses[0]?.emailAddress || "",
                            orderStatus: order.status,
                            quantity: item.quantity,
                            orderedAt: order.createdAt,
                            orderId: order._id,
                            contact: u.contact || null, // <-- include contact here
                        });
                    }
                });
            });
            setMatchedOrders(results);
        };
        fetchOrders();
    }, [user, myProducts]);

    const handleStatusChange = async (newStatus) => {
        if (!selectedOrder) return;
        setUpdating(true);
        try {
            await fetch('/api/user/orders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: selectedOrder.orderId,
                    status: newStatus,
                }),
            });
            setMatchedOrders(orders =>
                orders.map(o =>
                    o.orderId === selectedOrder.orderId ? { ...o, orderStatus: newStatus } : o
                )
            );
            setSelectedOrder(o => ({ ...o, orderStatus: newStatus }));
        } catch (e) {
            showToast('Failed to update order status: ' + e, 'error')
        }
        setUpdating(false);
    };

    return (
        <div className="dashboardSection">
            <div className="flex items-center font-semibold py-3 px-4">
                <AiOutlineExclamationCircle className="mr-2" />
                Requires Action
            </div>
            <div className='flex flex-col gap-1 text-xs font-normal p-4'>
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
                        <button
                            className="dashboardActionItem cursor-pointer hover:bg-baseColor transition"
                            key={order.productId + order.buyerId + order.orderedAt + idx}
                            onClick={() => setSelectedOrder(order)}
                        >
                            <Indicator type={indicatorType} />
                            <div className="w-full truncate font-normal">
                                Ship {order.productName} to {recipient}
                            </div>
                        </button>
                    );
                })}
            </div>

            {selectedOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 bg-opacity-30">
                    <div className="bg-background border border-borderColor rounded-md shadow-lg p-6 min-w-[340px] max-w-[95vw] gap-3 flex flex-col">
                        <div className="flex justify-between items-center text-base">
                            <div className="flex font-semibold ">Order Details</div>
                            <button
                                className="flex hover:opacity-80 cursor-pointer transition-all ease-in-out duration-300"
                                onClick={() => setSelectedOrder(null)}
                            >
                                <IoMdClose />
                            </button>
                        </div>
                        <div className="flex flex-col">
                            <div className="text-xs text-lightColor ">Product</div>
                            <div className="flex items-center font-medium mb-2 justify-between">
                                {selectedOrder.productName}
                                <div>
                                    x{selectedOrder.quantity}
                                </div>
                            </div>

                        </div>
                        <div className="flex flex-col">
                            <div className="text-xs text-lightColor mb-1">Order Status</div>
                            <div className="flex gap-2">
                                {["pending", "shipped", "cancelled"].map(status => (
                                    <button
                                        key={status}
                                        disabled={updating || selectedOrder.orderStatus === status}
                                        className={`px-3 py-1 rounded border border-borderColor text-xs font-medium cursor-pointer
                                            ${selectedOrder.orderStatus === status ? "bg-borderColor/60 border-extraLight" : "bg-background hover:bg-baseColor"}
                                            transition`}
                                        onClick={() => handleStatusChange(status)}
                                    >
                                        {status.charAt(0).toUpperCase() + status.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <div className="text-xs text-lightColor">Buyer</div>
                            <div className="font-medium mb-">{selectedOrder.buyerFirstName}</div>
                            <div className="text-xs font-normal">{selectedOrder.buyerEmail}</div>
                        </div>
                        <div>
                            {selectedOrder.contact ? (
                                <div className="flex flex-col border border-borderColor rounded-md py-2 px-3 bg-baseColor/40 gap-2">
                                    <div>
                                        <span className="block text-xs text-lightColor font-semibold mb-1">Address</span>
                                        <span className="text-xs text-textColor text-normal">
                                            {selectedOrder.contact.address
                                                ? [
                                                    selectedOrder.contact.address.street,
                                                    selectedOrder.contact.address.unitNumber,
                                                    selectedOrder.contact.address.city,
                                                    selectedOrder.contact.address.state,
                                                    selectedOrder.contact.address.postalCode,
                                                    selectedOrder.contact.address.country,
                                                ]
                                                    .filter(Boolean)
                                                    .join(', ')
                                                : "N/A"}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="block text-xs text-lightColor font-semibold mb-1">Phone</span>
                                        <span className="text-xs text-textColor">
                                            {selectedOrder.contact.phone
                                                ? `${selectedOrder.contact.phone.countryCode} ${selectedOrder.contact.phone.number}`
                                                : "N/A"}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-xs text-lightColor">N/A</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default ActionItems