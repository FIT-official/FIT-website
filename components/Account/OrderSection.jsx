import Image from 'next/image';
import { useEffect, useState } from 'react';

function OrderSkeleton() {
    return (
        <div className="border border-borderColor rounded-lg p-0 flex flex-col gap-0 animate-pulse bg-white">
            <div className="flex flex-row flex-wrap items-center justify-between border-b border-borderColor px-4 py-3 rounded-t-lg">
                <div className="flex flex-row gap-8 text-xs">
                    <div className="h-4 w-24 bg-borderColor/40 rounded mb-2"></div>
                    <div className="h-4 w-16 bg-borderColor/40 rounded mb-2"></div>
                </div>
                <div className="h-4 w-24 bg-borderColor/40 rounded"></div>
            </div>
            <div className="flex flex-row gap-4 px-4 py-4 items-center">
                <div className="w-20 h-20 rounded-sm bg-borderColor/20 flex items-center justify-center overflow-hidden border border-borderColor/30" />
                <div className="flex flex-col flex-1 min-w-0 gap-2">
                    <div className="h-5 w-2/3 bg-borderColor/40 rounded"></div>
                    <div className="h-4 w-1/2 bg-borderColor/30 rounded"></div>
                    <div className="flex flex-row gap-4 mt-2">
                        <div className="h-4 w-12 bg-borderColor/30 rounded"></div>
                        <div className="h-4 w-16 bg-borderColor/30 rounded"></div>
                    </div>
                </div>
                <div className="flex flex-col items-end min-w-[90px] gap-2">
                    <div className="h-3 w-10 bg-borderColor/30 rounded"></div>
                    <div className="h-6 w-16 bg-borderColor/40 rounded"></div>
                </div>
            </div>
        </div>
    );
}

function OrderSection() {
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        (async () => {
            setLoading(true);
            setError("");
            try {
                // Fetch orders
                const ordersRes = await fetch("/api/user/orders");
                if (!ordersRes.ok) throw new Error("Failed to fetch orders");
                const ordersData = await ordersRes.json();
                const ordersArr = ordersData.orders || [];
                setOrders(ordersArr);

                const productIds = [
                    ...new Set(
                        ordersArr
                            .map(order => order.cartItem?.productId)
                            .filter(Boolean)
                    ),
                ];

                let productsMap = {};
                if (productIds.length > 0) {
                    const prodRes = await fetch(`/api/product?ids=${productIds.join(",")}`);
                    if (prodRes.ok) {
                        const prodData = await prodRes.json();
                        (prodData.products || []).forEach(prod => {
                            productsMap[prod._id] = prod;
                        });
                    }
                }
                setProducts(productsMap);
            } catch (err) {
                setError(err.message || "Failed to load orders.");
            }
            setLoading(false);
        })();
    }, []);

    return (
        <div className='flex flex-col overflow-auto'>
            <h2 className="font-semibold mb-2 text-textColor">Order History</h2>
            <p className="flex text-xs max-w-sm mb-6">
                Here you can view your past orders and their details.
            </p>
            {loading && (
                <div className="flex flex-col gap-6">
                    <OrderSkeleton />
                    <OrderSkeleton />
                </div>
            )}
            {error && <div className="text-red-400 text-xs">{error}</div>}
            {!loading && orders.length === 0 && <div className="text-lightColor text-xs">No orders found.</div>}
            <div className="flex flex-col gap-6">
                {orders.map((order, idx) => {
                    const cartItem = order.cartItem || {};
                    const product = products[cartItem.productId] || {};
                    return (
                        <div
                            key={idx}
                            className="border border-borderColor rounded-lg  p-0 md:p-0 flex flex-col gap-0"
                        >
                            <div className="flex flex-row flex-wrap items-center justify-between border-b border-borderColor px-4 py-3 bg-white rounded-t-lg md:gap-0 gap-1">
                                <div className="flex flex-row md:justify-start justify-between gap-8 text-xs text-lightColor w-full md:w-fit">
                                    <div>
                                        <span className="font-medium text-textColor">Order Date:</span>{" "}
                                        {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "-"}
                                    </div>
                                    <div>
                                        <span className="font-medium text-textColor">Status:</span>{" "}
                                        <span className="capitalize">{order.status}</span>
                                    </div>
                                </div>
                                <div className="flex flex-row gap-2 items-center">
                                    <span className="text-xs text-lightColor">Order:</span>
                                    <span className="font-semibold text-textColor text-xs uppercase">#{order._id?.slice(-8) || "N/A"}</span>
                                </div>
                            </div>
                            <div className="flex flex-col md:flex-row gap-4 px-4 py-4 items-start md:items-center">
                                <div className="w-20 h-20 rounded-sm bg-borderColor/10 flex items-center justify-center overflow-hidden border border-borderColor/30">
                                    <Image
                                        src={`/api/proxy?key=${encodeURIComponent(product.images?.[0] || "/placeholder.png")}`}
                                        alt={product.name || "Product"}
                                        width={80}
                                        height={80}
                                        className="object-cover w-full h-full"
                                    />
                                </div>
                                <div className="flex flex-col flex-1 w-full md:w-xs">
                                    <div className="font-semibold text-textColor text-base truncate">
                                        {product.name || cartItem.productId}
                                    </div>
                                    <div className="text-xs text-lightColor truncate">
                                        {product.description || ""}
                                    </div>
                                    <div className="flex flex-row gap-4 mt-2 text-xs text-lightColor">
                                        <div>
                                            <span className="font-medium text-textColor">Qty:</span> {cartItem.quantity}
                                        </div>
                                        <div>
                                            <span className="font-medium text-textColor">Delivery:</span> {cartItem.chosenDeliveryType}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col md:items-end min-w-[90px]">
                                    <span className="text-xs text-lightColor">Paid</span>
                                    <span className="font-semibold text-textColor text-lg">
                                        {`S$${cartItem.price.toFixed(2)}`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default OrderSection;