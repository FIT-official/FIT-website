'use client'
import { useEffect, useState } from "react"
import { FaRegCopy } from "react-icons/fa"
import { TbTruckDelivery, TbPackage, TbBox, TbChecks, TbClock } from "react-icons/tb"
import { FiPackage, FiTruck } from "react-icons/fi"
import { BiPackage } from "react-icons/bi"
import { IoMdCheckmarkCircleOutline, IoMdPrint } from "react-icons/io"
import { useToast } from "@/components/General/ToastProvider"

const ICON_COMPONENTS = {
    TbTruckDelivery,
    TbPackage,
    TbBox,
    TbChecks,
    FiPackage,
    FiTruck,
    IoMdCheckmarkCircleOutline,
    IoMdPrint,
    TbClock,
    BiPackage
}

function OrderPage({ orderId }) {
    const [order, setOrder] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [orderStatuses, setOrderStatuses] = useState([])
    const { showToast } = useToast()

    useEffect(() => {
        const fetchOrder = async () => {
            try {
                // Fetch order data
                const orderRes = await fetch(`/api/user/orders?orderId=${orderId}`)
                const orderData = await orderRes.json()

                if (!orderRes.ok) {
                    throw new Error(orderData.error || 'Order not found')
                }

                // Check if tracking ID exists
                if (!orderData.order.trackingId) {
                    setError('This order does not have a tracking ID yet.')
                    setLoading(false)
                    return
                }

                // Fetch order statuses
                const statusRes = await fetch('/api/admin/settings')
                const statusData = await statusRes.json()

                setOrder(orderData.order)
                setOrderStatuses(statusData.orderStatuses || [])
                setLoading(false)
            } catch (err) {
                console.error('Error fetching order:', err)
                setError(err.message)
                setLoading(false)
            }
        }

        fetchOrder()
    }, [orderId])

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text)
            showToast('Copied to clipboard!', 'success')
        } catch (err) {
            showToast('Failed to copy', 'error')
        }
    }

    const getStatusInfo = (statusKey) => {
        const status = orderStatuses.find(s => s.statusKey === statusKey)
        return status || {
            displayName: statusKey.charAt(0).toUpperCase() + statusKey.slice(1).replace(/_/g, ' '),
            color: '#6b7280',
            icon: 'TbPackage'
        }
    }

    if (loading) {
        return (
            <div className="min-h-[92vh] flex flex-col items-center justify-center p-12">
                <div className="animate-pulse text-lightColor">Loading order details...</div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="min-h-[92vh] flex flex-col items-center justify-center p-12">
                <div className="text-center">
                    <h2 className="text-2xl font-semibold text-textColor mb-2">Order Not Available</h2>
                    <p className="text-lightColor">{error}</p>
                </div>
            </div>
        )
    }

    const statusHistory = order.statusHistory || []
    const hasHistory = statusHistory.length > 0

    return (
        <div className="min-h-[92vh] flex flex-col items-center p-6 md:p-12 border-b border-borderColor justify-start gap-6">
            <div className="flex w-full flex-col gap-1 max-w-5xl">
                <h2 className="text-2xl md:text-3xl font-bold">Order #{order._id.toString().slice(-8).toUpperCase()}</h2>
                <h3 className="flex text-sm text-lightColor">
                    Placed on {new Date(order.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    })}
                </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 w-full max-w-5xl gap-4">
                {/* Timeline Section */}
                <div className="w-full lg:col-span-2 flex p-6 bg-white border border-borderColor rounded-xl flex-col gap-4">
                    <div className="flex font-medium text-sm text-textColor items-center justify-between">
                        <span>Tracking ID:</span>
                        <button
                            onClick={() => copyToClipboard(order.trackingId)}
                            className="px-3 py-2 border border-borderColor rounded-lg text-sm hover:bg-baseColor transition flex items-center gap-2 justify-center cursor-pointer font-mono"
                        >
                            {order.trackingId} <FaRegCopy />
                        </button>
                    </div>

                    <div className="border-t border-borderColor pt-4">
                        <h3 className="text-sm font-semibold text-textColor mb-4">Order Timeline</h3>
                        {hasHistory ? (
                            <div className="flex-col flex">
                                {statusHistory.map((historyItem, index) => {
                                    const statusInfo = getStatusInfo(historyItem.status)
                                    const IconComponent = ICON_COMPONENTS[statusInfo.icon] || TbPackage
                                    const isLast = index === statusHistory.length - 1

                                    return (
                                        <div key={index} className="flex flex-row gap-3">
                                            <div className="flex flex-col items-center">
                                                <div
                                                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                                                    style={{ backgroundColor: `${statusInfo.color}20` }}
                                                >
                                                    <IconComponent size={20} style={{ color: statusInfo.color }} />
                                                </div>
                                                {!isLast && <div className="w-px h-8 bg-borderColor my-1.5" />}
                                            </div>
                                            <div className="flex-col flex gap-1 pb-6">
                                                <p className="text-sm font-semibold text-textColor">{statusInfo.displayName}</p>
                                                <p className="text-xs font-normal text-lightColor">
                                                    {new Date(historyItem.timestamp).toLocaleDateString('en-US', {
                                                        month: 'short',
                                                        day: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-lightColor text-sm">
                                <TbClock className="mx-auto mb-2" size={24} />
                                <p>No status updates yet</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Order Summary Section */}
                <div className="w-full lg:col-span-1 flex p-6 bg-white border border-borderColor rounded-xl flex-col gap-4">
                    <h3 className="text-sm font-semibold text-textColor">Order Summary</h3>

                    {order.cartItem && (
                        <div className="space-y-3">
                            <div>
                                <p className="text-xs text-lightColor">Current Status</p>
                                <div className="mt-1">
                                    {(() => {
                                        const statusInfo = getStatusInfo(order.status)
                                        return (
                                            <span
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium inline-block"
                                                style={{
                                                    backgroundColor: `${statusInfo.color}20`,
                                                    color: statusInfo.color,
                                                    border: `1px solid ${statusInfo.color}40`
                                                }}
                                            >
                                                {statusInfo.displayName}
                                            </span>
                                        )
                                    })()}
                                </div>
                            </div>

                            <div className="pt-3 border-t border-borderColor">
                                <p className="text-xs text-lightColor">Quantity</p>
                                <p className="text-sm font-medium text-textColor">{order.cartItem.quantity}</p>
                            </div>

                            <div>
                                <p className="text-xs text-lightColor">Delivery Type</p>
                                <p className="text-sm font-medium text-textColor capitalize">
                                    {order.cartItem.chosenDeliveryType || 'Standard'}
                                </p>
                            </div>

                            <div>
                                <p className="text-xs text-lightColor">Total Price</p>
                                <p className="text-lg font-bold text-textColor">
                                    ${(order.cartItem.price || 0).toFixed(2)}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="w-full lg:col-span-2 flex p-6 bg-white border border-borderColor rounded-xl flex-col gap-4">
                    <h3 className="text-sm font-semibold text-textColor">Additional Information</h3>

                    {order.notes && (
                        <div className="p-3 bg-baseColor/30 rounded-lg">
                            <p className="text-xs text-lightColor mb-1">Order Notes</p>
                            <p className="text-sm text-textColor">{order.notes}</p>
                        </div>
                    )}

                    <div className="text-xs text-lightColor">
                        <p>If you have any questions about your order, please contact support with your order ID.</p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default OrderPage    