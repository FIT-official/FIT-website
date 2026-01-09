'use client'
import Indicator from "@/components/DashboardComponents/Indicator";
import { useEffect, useState } from "react";
import { AiOutlineExclamationCircle } from "react-icons/ai";
import { useToast } from "../General/ToastProvider";
import { IoMdClose } from "react-icons/io";
import { useOrderStatuses, getStatusDisplayName, getStatusColor } from "@/utils/useOrderStatuses";
import { HiDownload, HiChevronDown, HiChevronRight, HiClipboardCopy } from "react-icons/hi";
import { BiListUl } from "react-icons/bi";
import { MdOutlineLightbulb } from "react-icons/md";

function ActionItems({ user, myProducts }) {
    const [matchedOrders, setMatchedOrders] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [updating, setUpdating] = useState(false);
    const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
    const [expandedOrders, setExpandedOrders] = useState(new Set());
    const [trackingId, setTrackingId] = useState('');
    const { showToast } = useToast();
    const { orderStatuses: regularOrderStatuses } = useOrderStatuses('order'); // Get regular order statuses
    const { orderStatuses: printOrderStatuses } = useOrderStatuses('printOrder'); // Get print order statuses

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
            const userList = Array.isArray(users) ? users : [];
            userList.forEach(u => {
                if (!u.orderHistory || !Array.isArray(u.orderHistory)) return;
                u.orderHistory.forEach(order => {
                    const item = order.cartItem;
                    if (productIds.includes(item.productId)) {
                        results.push({
                            productId: item.productId,
                            productName: myProductMap[item.productId],
                            buyerId: u.userId,
                            buyerFirstName: u.firstName || "",
                            buyerEmail: u.emailAddresses?.[0]?.emailAddress || "",
                            orderStatus: order.status,
                            orderType: order.orderType || "order", // Include order type
                            printStatus: order.printStatus || null, // Include print status if available
                            quantity: item.quantity,
                            orderedAt: order.createdAt,
                            orderId: order._id,
                            contact: u.contact || null,
                            orderNote: item.orderNote || "", // Include order note
                            deliveryType: item.chosenDeliveryType || "",
                            price: item.price || 0,
                            printConfiguration: order.printConfiguration || null, // Include print config for print orders
                            trackingId: order.trackingId || null, // Include tracking ID
                        });
                    }
                });
            });
            setMatchedOrders(results);
        };
        fetchOrders();
    }, [user, myProducts]);

    // Set tracking ID when order is selected
    useEffect(() => {
        if (selectedOrder) {
            setTrackingId(selectedOrder.trackingId || '');
        }
    }, [selectedOrder]);

    const handleStatusChange = async (newStatus) => {
        if (!selectedOrder) return;
        setUpdating(true);
        try {
            const response = await fetch('/api/user/orders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: selectedOrder.orderId,
                    status: newStatus,
                    trackingId: trackingId || undefined
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to update order');
            }

            setMatchedOrders(orders =>
                orders.map(o =>
                    o.orderId === selectedOrder.orderId
                        ? { ...o, orderStatus: newStatus, trackingId: trackingId || o.trackingId }
                        : o
                )
            );
            setSelectedOrder(o => ({ ...o, orderStatus: newStatus, trackingId: trackingId || o.trackingId }));
            showToast('Order updated successfully', 'success');
        } catch (e) {
            showToast('Failed to update order: ' + e.message, 'error')
        }
        setUpdating(false);
    };

    const handleTrackingIdUpdate = async () => {
        if (!selectedOrder) return;
        setUpdating(true);
        try {
            const response = await fetch('/api/user/orders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: selectedOrder.orderId,
                    trackingId: trackingId || null
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to update tracking ID');
            }

            setMatchedOrders(orders =>
                orders.map(o =>
                    o.orderId === selectedOrder.orderId ? { ...o, trackingId: trackingId || null } : o
                )
            );
            setSelectedOrder(o => ({ ...o, trackingId: trackingId || null }));
            showToast('Tracking ID updated successfully', 'success');
        } catch (e) {
            showToast('Failed to update tracking ID: ' + e.message, 'error')
        }
        setUpdating(false);
    };

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied to clipboard!', 'success');
        } catch (err) {
            showToast('Failed to copy to clipboard', 'error');
        }
    };

    const toggleOrderExpansion = (orderId) => {
        const newExpanded = new Set(expandedOrders);
        if (newExpanded.has(orderId)) {
            newExpanded.delete(orderId);
        } else {
            newExpanded.add(orderId);
        }
        setExpandedOrders(newExpanded);
    };

    const exportToExcel = () => {
        const headers = [
            'Order ID', 'Product', 'Buyer Name', 'Buyer Email', 'Status',
            'Order Type', 'Quantity', 'Price', 'Delivery Type', 'Order Date',
            'Order Note', 'Contact Address', 'Contact Phone'
        ];

        const csvData = matchedOrders.map(order => [
            order.orderId,
            order.productName,
            order.buyerFirstName,
            order.buyerEmail,
            order.orderStatus,
            order.orderType,
            order.quantity,
            `$${(order.price || 0).toFixed(2)}`,
            order.deliveryType,
            new Date(order.orderedAt).toLocaleDateString(),
            order.orderNote || '',
            order.contact?.address ? [
                order.contact.address.street,
                order.contact.address.unitNumber,
                order.contact.address.city,
                order.contact.address.state,
                order.contact.address.postalCode,
                order.contact.address.country,
            ].filter(Boolean).join(', ') : '',
            order.contact?.phone ? `${order.contact.phone.countryCode} ${order.contact.phone.number}` : ''
        ]);

        const csvContent = [headers, ...csvData]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `orders_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Orders exported successfully!', 'success');
    };

    return (
        <div className="dashboardSection">
            <div className="flex items-center justify-between font-semibold py-3 px-4 border-b border-borderColor">
                <div className="flex items-center">
                    <AiOutlineExclamationCircle className="mr-2" />
                    Orders ({matchedOrders.length})
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                        className="p-1 hover:bg-borderColor/20 rounded text-sm"
                        title={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}
                    >
                        <BiListUl size={16} />
                    </button>
                    {matchedOrders.length > 0 && (
                        <button
                            onClick={exportToExcel}
                            className="p-1 hover:bg-borderColor/20 rounded text-sm"
                            title="Export to CSV"
                        >
                            <HiDownload size={16} />
                        </button>
                    )}
                </div>
            </div>
            <div className='flex flex-col text-xs font-normal p-4 overflow-y-auto flex-1'>
                {matchedOrders.length === 0 && (
                    <div className="text-lightColor text-center py-8">No orders found.</div>
                )}

                {viewMode === 'grid' ? (
                    // Grid View (Original)
                    <div className="flex flex-col gap-1">
                        {matchedOrders.map((order, idx) => {
                            // Determine indicator type based on status color/type
                            let indicatorType = 0;
                            const allStatuses = [...regularOrderStatuses, ...printOrderStatuses];
                            const statusColor = getStatusColor(order.orderStatus, allStatuses);
                            if (order.orderStatus === "pending" || order.orderStatus === "pending_config" || statusColor === "#f59e0b") indicatorType = 1;
                            else if (order.orderStatus === "cancelled" || order.orderStatus === "failed" || statusColor === "#ef4444" || statusColor === "#dc2626") indicatorType = 2;
                            else indicatorType = 0;

                            const recipient = order.buyerFirstName || order.buyerEmail || "Unknown";

                            return (
                                <button
                                    className="dashboardActionItem cursor-pointer hover:bg-baseColor transition"
                                    key={order.orderId + idx}
                                    onClick={() => setSelectedOrder(order)}
                                >
                                    <Indicator type={indicatorType} />
                                    <div className="w-full truncate font-normal">
                                        {order.productName} - {recipient}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    // List View (New)
                    <div className="flex flex-col gap-2">
                        {matchedOrders.map((order, idx) => {
                            const allStatuses = [...regularOrderStatuses, ...printOrderStatuses];
                            const statusColor = getStatusColor(order.orderStatus, allStatuses);
                            const statusName = getStatusDisplayName(order.orderStatus, allStatuses);
                            const isExpanded = expandedOrders.has(order.orderId);

                            return (
                                <div key={order.orderId + idx} className="border border-borderColor rounded-lg">
                                    <div
                                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-baseColor/50 transition"
                                        onClick={() => toggleOrderExpansion(order.orderId)}
                                    >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="flex-shrink-0">
                                                {isExpanded ? <HiChevronDown size={16} /> : <HiChevronRight size={16} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium truncate">{order.productName}</div>
                                                <div className="text-xs text-lightColor">{order.buyerFirstName || order.buyerEmail}</div>
                                            </div>
                                            <div className="flex-shrink-0">
                                                <span
                                                    className="px-2 py-1 rounded text-xs font-medium"
                                                    style={{
                                                        backgroundColor: `${statusColor}15`,
                                                        color: statusColor,
                                                        border: `1px solid ${statusColor}30`
                                                    }}
                                                >
                                                    {statusName}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="border-t border-borderColor p-3 bg-baseColor/20">
                                            <div className="grid grid-cols-2 gap-3 text-xs">
                                                <div>
                                                    <span className="text-lightColor">Order ID:</span>
                                                    <div className="font-mono">{order.orderId.slice(-8)}</div>
                                                </div>
                                                <div>
                                                    <span className="text-lightColor">Quantity:</span>
                                                    <div>{order.quantity}</div>
                                                </div>
                                                <div>
                                                    <span className="text-lightColor">Price:</span>
                                                    <div>${(order.price || 0).toFixed(2)}</div>
                                                </div>
                                                <div>
                                                    <span className="text-lightColor">Delivery:</span>
                                                    <div>{order.deliveryType}</div>
                                                </div>
                                                <div className="col-span-2">
                                                    <span className="text-lightColor">Order Date:</span>
                                                    <div>{new Date(order.orderedAt).toLocaleString()}</div>
                                                </div>
                                                {order.orderNote && (
                                                    <div className="col-span-2">
                                                        <span className="text-lightColor">Note:</span>
                                                        <div className="mt-1 p-2 bg-background border border-borderColor rounded text-xs">
                                                            {order.orderNote}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex gap-2 mt-3">
                                                <button
                                                    onClick={() => setSelectedOrder(order)}
                                                    className="px-3 py-1 bg-black text-white rounded text-xs hover:bg-gray-800 transition"
                                                >
                                                    View Details
                                                </button>
                                                {order.contact && (
                                                    <button
                                                        onClick={() => copyToClipboard(
                                                            order.contact?.address ? [
                                                                order.contact.address.street,
                                                                order.contact.address.unitNumber,
                                                                order.contact.address.city,
                                                                order.contact.address.state,
                                                                order.contact.address.postalCode,
                                                                order.contact.address.country,
                                                            ].filter(Boolean).join(', ') : ''
                                                        )}
                                                        className="px-3 py-1 border border-borderColor rounded text-xs hover:bg-baseColor transition flex items-center gap-1"
                                                    >
                                                        <HiClipboardCopy size={12} />
                                                        Copy Address
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {selectedOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-background border border-borderColor rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="flex justify-between items-center px-6 py-4 border-b border-borderColor bg-white">
                            <div className="flex flex-col">
                                <h2 className="text-lg font-semibold text-textColor">Order Details</h2>
                                <p className="text-xs text-lightColor mt-0.5">
                                    Order #{selectedOrder.orderId.slice(-8).toUpperCase()}
                                </p>
                            </div>
                            <button
                                className="p-2 hover:bg-baseColor rounded-lg transition-colors"
                                onClick={() => setSelectedOrder(null)}
                            >
                                <IoMdClose size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="overflow-y-auto flex-1 px-6 py-4">
                            <div className="space-y-6">
                                {/* Order Status Section - Prominently placed at top */}
                                <div className="bg-white border border-borderColor rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-textColor">Update Order Status</h3>
                                        {updating && (
                                            <span className="text-xs text-lightColor animate-pulse">Updating...</span>
                                        )}
                                    </div>
                                    <div className="flex gap-2 flex-wrap">
                                        {(() => {
                                            const isPrintOrder = selectedOrder.orderType === "printOrder";
                                            const availableStatuses = isPrintOrder ? printOrderStatuses : regularOrderStatuses;
                                            const allStatuses = [...regularOrderStatuses, ...printOrderStatuses];
                                            const currentStatusColor = getStatusColor(selectedOrder.orderStatus, allStatuses);

                                            return availableStatuses
                                                .filter(status => status.isActive !== false)
                                                .sort((a, b) => (a.order || 0) - (b.order || 0))
                                                .map(status => {
                                                    const isSelected = selectedOrder.orderStatus === status.statusKey;
                                                    return (
                                                        <button
                                                            key={status.statusKey}
                                                            disabled={updating || isSelected}
                                                            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${isSelected
                                                                ? "shadow-sm cursor-default"
                                                                : "hover:scale-105 hover:shadow-md active:scale-95"
                                                                }`}
                                                            onClick={() => handleStatusChange(status.statusKey)}
                                                            style={{
                                                                backgroundColor: isSelected ? `${status.color}20` : "white",
                                                                color: isSelected ? status.color : "#6b7280",
                                                                border: `2px solid ${isSelected ? status.color : "#e5e7eb"}`,
                                                            }}
                                                        >
                                                            {status.displayName || status.statusKey.charAt(0).toUpperCase() + status.statusKey.slice(1)}
                                                        </button>
                                                    );
                                                });
                                        })()}
                                    </div>
                                </div>

                                {/* Tracking ID Section */}
                                <div className="bg-white border border-borderColor rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-textColor">Tracking ID</h3>
                                        {selectedOrder.trackingId && (
                                            <a
                                                href={`/account/orders/${selectedOrder.orderId}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-blue-600 hover:text-blue-800 underline"
                                            >
                                                View Customer Page
                                            </a>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={trackingId}
                                                onChange={(e) => setTrackingId(e.target.value)}
                                                placeholder="Enter tracking ID (e.g., SPX123456789)"
                                                className="formInput flex-1 text-sm"
                                                disabled={updating}
                                            />
                                            <button
                                                onClick={handleTrackingIdUpdate}
                                                disabled={updating || trackingId === (selectedOrder.trackingId || '')}
                                                className="px-4 py-2 bg-black text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {updating ? 'Saving...' : 'Save'}
                                            </button>
                                        </div>
                                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2 items-start text-xs text-blue-900">
                                            <MdOutlineLightbulb className="shrink-0 mt-0.5" />
                                            <p>
                                                {selectedOrder.trackingId
                                                    ? 'Customer can track this order at /account/orders/' + selectedOrder.orderId.slice(-8)
                                                    : 'Add a tracking ID to enable the customer order tracking page. Leave empty if no tracking is needed.'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Product Info */}
                                <div className="bg-white border border-borderColor rounded-lg p-4">
                                    <h3 className="text-sm font-semibold text-textColor mb-3">Product Information</h3>
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <p className="font-medium text-textColor">{selectedOrder.productName}</p>
                                            <div className="flex items-center gap-4 mt-2 text-xs text-lightColor">
                                                <span>Quantity: <span className="font-semibold text-textColor">{selectedOrder.quantity}</span></span>
                                                <span>Price: <span className="font-semibold text-textColor">${(selectedOrder.price || 0).toFixed(2)}</span></span>
                                                <span>Delivery: <span className="font-semibold text-textColor capitalize">{selectedOrder.deliveryType}</span></span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-borderColor text-xs text-lightColor">
                                        Ordered on {new Date(selectedOrder.orderedAt).toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </div>
                                </div>

                                {/* Order Note - Highlighted if present */}
                                {selectedOrder.orderNote && (
                                    <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
                                        <div className="flex items-start gap-2">
                                            <div className="flex-shrink-0 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center text-white text-xs font-bold mt-0.5">
                                                !
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="text-sm font-semibold text-amber-900 mb-1">Customer Note</h3>
                                                <p className="text-sm text-amber-800 whitespace-pre-wrap">{selectedOrder.orderNote}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Customer Info */}
                                <div className="bg-white border border-borderColor rounded-lg p-4">
                                    <h3 className="text-sm font-semibold text-textColor mb-3">Customer Information</h3>
                                    <div className="flex flex-col">
                                        <div className="flex items-center">
                                            <span className="flex text-xs text-lightColor w-20">Name:</span>
                                            <span className="flex text-sm font-medium text-textColor">{selectedOrder.buyerFirstName || "N/A"}</span>
                                        </div>
                                        <div className="flex items-center">
                                            <span className="flex text-xs text-lightColor w-20">Email:</span>
                                            <span className="flex text-sm text-textColor">{selectedOrder.buyerEmail}</span>
                                            <button
                                                onClick={() => copyToClipboard(selectedOrder.buyerEmail)}
                                                className="flex p-1 hover:bg-baseColor rounded transition-colors"
                                                title="Copy email"
                                            >
                                                <HiClipboardCopy size={14} className="text-lightColor" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Shipping Address */}
                                {selectedOrder.contact && (
                                    <div className="bg-white border border-borderColor rounded-lg p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-sm font-semibold text-textColor">Shipping Address</h3>
                                            <button
                                                onClick={() => {
                                                    const contactInfo = [
                                                        selectedOrder.contact.address ? [
                                                            selectedOrder.contact.address.street,
                                                            selectedOrder.contact.address.unitNumber,
                                                            selectedOrder.contact.address.city,
                                                            selectedOrder.contact.address.state,
                                                            selectedOrder.contact.address.postalCode,
                                                            selectedOrder.contact.address.country,
                                                        ].filter(Boolean).join(', ') : '',
                                                        selectedOrder.contact.phone ? `Phone: ${selectedOrder.contact.phone.countryCode} ${selectedOrder.contact.phone.number}` : ''
                                                    ].filter(Boolean).join('\n');
                                                    copyToClipboard(contactInfo);
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-black text-white rounded-lg text-xs hover:bg-gray-800 transition-colors"
                                            >
                                                <HiClipboardCopy size={14} />
                                                Copy Address
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {selectedOrder.contact.address && (
                                                <div className="bg-baseColor/30 rounded-lg p-3">
                                                    <p className="text-sm text-textColor leading-relaxed">
                                                        {[
                                                            selectedOrder.contact.address.street,
                                                            selectedOrder.contact.address.unitNumber,
                                                            selectedOrder.contact.address.city,
                                                            selectedOrder.contact.address.state,
                                                            selectedOrder.contact.address.postalCode,
                                                            selectedOrder.contact.address.country,
                                                        ]
                                                            .filter(Boolean)
                                                            .join(', ')}
                                                    </p>
                                                </div>
                                            )}
                                            {selectedOrder.contact.phone && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-lightColor">Phone:</span>
                                                    <span className="text-sm font-medium text-textColor">
                                                        {selectedOrder.contact.phone.countryCode} {selectedOrder.contact.phone.number}
                                                    </span>
                                                    <button
                                                        onClick={() => copyToClipboard(`${selectedOrder.contact.phone.countryCode} ${selectedOrder.contact.phone.number}`)}
                                                        className="p-1 hover:bg-baseColor rounded transition-colors"
                                                        title="Copy phone"
                                                    >
                                                        <HiClipboardCopy size={14} className="text-lightColor" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Print Configuration */}
                                {selectedOrder.orderType === "printOrder" && selectedOrder.printConfiguration && (
                                    <div className="bg-white border border-borderColor rounded-lg p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-sm font-semibold text-textColor">Print Configuration</h3>
                                            <button
                                                onClick={() => copyToClipboard(JSON.stringify(selectedOrder.printConfiguration, null, 2))}
                                                className="flex items-center gap-1 px-3 py-1.5 border border-borderColor rounded-lg text-xs hover:bg-baseColor transition-colors"
                                            >
                                                <HiClipboardCopy size={14} />
                                                Copy JSON
                                            </button>
                                        </div>
                                        <div className="bg-baseColor/30 rounded-lg p-3 text-sm space-y-3">
                                            {selectedOrder.printConfiguration.meshColors && (
                                                <div>
                                                    <p className="font-semibold text-textColor mb-2">Mesh Colors:</p>
                                                    <div className="space-y-1.5 ml-2">
                                                        {Object.entries(selectedOrder.printConfiguration.meshColors).map(([mesh, color]) => (
                                                            <div key={mesh} className="flex items-center gap-2 text-xs">
                                                                <span className="text-lightColor min-w-24">{mesh}:</span>
                                                                <div
                                                                    className="w-6 h-6 rounded border-2 border-white shadow-sm"
                                                                    style={{ backgroundColor: color }}
                                                                />
                                                                <span className="font-mono text-textColor">{color}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {selectedOrder.printConfiguration.printSettings && (
                                                <div>
                                                    <p className="font-semibold text-textColor mb-2">Print Settings:</p>
                                                    <div className="ml-2 grid grid-cols-2 gap-2">
                                                        {Object.entries(selectedOrder.printConfiguration.printSettings).map(([key, value]) => (
                                                            <div key={key} className="text-xs">
                                                                <span className="text-lightColor">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</span>{' '}
                                                                <span className="font-medium text-textColor">{String(value)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {selectedOrder.printConfiguration.configuredAt && (
                                                <div className="pt-2 border-t border-borderColor">
                                                    <span className="text-xs text-lightColor">
                                                        Configured: {new Date(selectedOrder.printConfiguration.configuredAt).toLocaleString()}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default ActionItems