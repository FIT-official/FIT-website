'use client'
import { useEffect, useState } from "react"
import { FaRegCopy } from "react-icons/fa"
import { TbTruckDelivery, TbPackage, TbBox, TbChecks, TbClock } from "react-icons/tb"
import { FiPackage, FiTruck } from "react-icons/fi"
import { BiPackage } from "react-icons/bi"
import { IoMdCheckmarkCircleOutline, IoMdPrint } from "react-icons/io"
import { useToast } from "@/components/General/ToastProvider"
import Image from "next/image"

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
    const [product, setProduct] = useState(null)
    const [paymentMethod, setPaymentMethod] = useState(null)
    const [customerDetails, setCustomerDetails] = useState(null)
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

                const statusRes = await fetch('/api/admin/settings')
                const statusData = await statusRes.json()

                // Fetch product details if productId exists
                if (orderData.order.cartItem?.productId) {
                    try {
                        const productRes = await fetch(`/api/product?ids=${orderData.order.cartItem.productId}`)
                        const productData = await productRes.json()
                        if (productData.products && productData.products.length > 0) {
                            setProduct(productData.products[0])
                        }
                    } catch (err) {
                        console.error('Error fetching product:', err)
                    }
                }

                // Set user details from API response
                if (orderData.userDetails) {
                    setCustomerDetails({
                        name: orderData.userDetails.name,
                        email: orderData.userDetails.email,
                        phone: orderData.userDetails.phone
                    })
                }

                // Fetch payment method from Stripe if sessionId exists
                if (orderData.order.stripeSessionId) {
                    try {
                        const paymentRes = await fetch(`/api/checkout/payment-method?sessionId=${orderData.order.stripeSessionId}`)
                        if (paymentRes.ok) {
                            const paymentData = await paymentRes.json()
                            setPaymentMethod(paymentData.paymentMethod)
                            if (paymentData.customerDetails?.address) {
                                setCustomerDetails(prev => ({
                                    ...prev,
                                    address: paymentData.customerDetails.address
                                }))
                            }
                        }
                    } catch (err) {
                        console.error('Error fetching payment method:', err)
                    }
                }

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
                <div className="w-full lg:col-span-2 flex p-6 bg-white border border-borderColor rounded-xl flex-col gap-4 h-fit">
                    {order.trackingId && (
                        <div className="flex font-medium text-sm text-textColor items-center justify-between pb-4">
                            <span>Tracking ID:</span>
                            <button
                                onClick={() => copyToClipboard(order.trackingId)}
                                className="px-3 py-2 border border-borderColor rounded-lg text-sm hover:bg-baseColor transition flex items-center gap-2 justify-center cursor-pointer font-mono"
                            >
                                {order.trackingId} <FaRegCopy />
                            </button>
                        </div>
                    )}

                    <div>
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
                                                {!isLast && <div className="w-px h-4 bg-borderColor my-1.5" />}
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
                        <div className="space-y-4">
                            {/* Product Info with Thumbnail */}
                            {product && (
                                <div className="flex gap-3 ">
                                    <div className="w-16 h-16 rounded-lg bg-borderColor/10 flex items-center justify-center overflow-hidden border border-borderColor/30 shrink-0">
                                        <Image
                                            src={`/api/proxy?key=${encodeURIComponent(product.images?.[0] || "/placeholder.jpg")}`}
                                            alt={product.name || "Product"}
                                            width={64}
                                            height={64}
                                            className="object-cover w-full h-full"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-textColor truncate">{product.name}</p>
                                        <p className="text-xs text-lightColor mt-0.5">Qty: {order.cartItem.quantity}</p>
                                        {/* Display selected variants if available */}
                                        {order.cartItem.selectedVariants && Object.keys(order.cartItem.selectedVariants).length > 0 && (
                                            <div className="mt-1 text-xs text-lightColor">
                                                {Object.entries(order.cartItem.selectedVariants)
                                                    .map(([type, option]) => `${type}: ${option}`)
                                                    .join(', ')}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}



                            {/* Price Breakdown */}
                            <div className="pt-3 border-t border-borderColor space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-lightColor">Subtotal</span>
                                    <span className="text-textColor">
                                        {order.cartItem.currency || 'S'}${((order.cartItem.finalPrice || order.cartItem.price || 0) * order.cartItem.quantity).toFixed(2)}
                                    </span>
                                </div>

                                {order.cartItem.deliveryFee > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-lightColor">Shipping ({order.cartItem.chosenDeliveryType})</span>
                                        <span className="text-textColor">
                                            {order.cartItem.currency || 'S'}${order.cartItem.deliveryFee.toFixed(2)}
                                        </span>
                                    </div>
                                )}

                                {order.cartItem.priceBeforeDiscount && order.cartItem.finalPrice &&
                                    order.cartItem.priceBeforeDiscount !== order.cartItem.finalPrice && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-green-600">Discount</span>
                                            <span className="text-green-600">
                                                -{order.cartItem.currency || 'S'}${((order.cartItem.priceBeforeDiscount - order.cartItem.finalPrice) * order.cartItem.quantity).toFixed(2)}
                                            </span>
                                        </div>
                                    )}

                                <div className="flex justify-between text-base font-bold pt-2 border-t border-borderColor">
                                    <span className="text-textColor">Total</span>
                                    <span className="text-textColor">
                                        {order.cartItem.currency || 'S'}${(order.cartItem.price * order.cartItem.quantity).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Contact Information Section */}
                <div className="w-full lg:col-span-3 flex p-6 bg-white border border-borderColor rounded-xl flex-col gap-6">
                    <h3 className="text-base font-semibold text-textColor">Contact & Shipping Information</h3>

                    {/* Customer Contact Details - Highest Priority */}
                    <div className="bg-linear-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                        <h4 className="text-sm font-semibold text-textColor mb-3 flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            Customer Information
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {customerDetails?.name && (
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs font-medium text-blue-700 uppercase tracking-wide">Name</span>
                                    <span className="text-sm text-textColor font-medium">{customerDetails.name}</span>
                                </div>
                            )}
                            {customerDetails?.email && (
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs font-medium text-blue-700 uppercase tracking-wide">Email</span>
                                    <span className="text-sm text-textColor break-all">{customerDetails.email}</span>
                                </div>
                            )}
                            {customerDetails?.phone && (
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs font-medium text-blue-700 uppercase tracking-wide">Phone</span>
                                    <span className="text-sm text-textColor">{customerDetails.phone}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Addresses Grid - Visual Grouping */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Shipping Address */}
                        {order.contact?.address && (
                            <div className="border-2 border-green-200 rounded-xl p-4 bg-green-50/50 hover:shadow-md transition-shadow">
                                <div className="flex items-start gap-2 mb-3">
                                    <svg className="w-5 h-5 text-green-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <div className="flex-1">
                                        <h5 className="text-sm font-semibold text-green-900 mb-1">Shipping Address</h5>
                                        <p className="text-xs text-green-700 mb-2">Where your order will be delivered</p>
                                    </div>
                                </div>
                                <div className="pl-7">
                                    <div className="text-sm text-textColor leading-relaxed space-y-1">
                                        {order.contact.address.street && (
                                            <p>{order.contact.address.street}</p>
                                        )}
                                        {order.contact.address.unitNumber && (
                                            <p className="text-lightColor">Unit: {order.contact.address.unitNumber}</p>
                                        )}
                                        <p>
                                            {[
                                                order.contact.address.city,
                                                order.contact.address.state,
                                                order.contact.address.postalCode
                                            ].filter(Boolean).join(', ')}
                                        </p>
                                        {order.contact.address.country && (
                                            <p className="font-medium">{order.contact.address.country}</p>
                                        )}
                                    </div>
                                    {order.contact.phone && (
                                        <div className="mt-3 pt-3 border-t border-green-200">
                                            <span className="text-xs text-green-700 font-medium">Contact: </span>
                                            <span className="text-sm text-textColor">
                                                {order.contact.phone.countryCode} {order.contact.phone.number}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Billing Address */}
                        {customerDetails?.address && (
                            <div className="border-2 border-purple-200 rounded-xl p-4 bg-purple-50/50 hover:shadow-md transition-shadow">
                                <div className="flex items-start gap-2 mb-3">
                                    <svg className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                    </svg>
                                    <div className="flex-1">
                                        <h5 className="text-sm font-semibold text-purple-900 mb-1">Billing Address</h5>
                                        <p className="text-xs text-purple-700 mb-2">Payment information on file</p>
                                    </div>
                                </div>
                                <div className="pl-7">
                                    <div className="text-sm text-textColor leading-relaxed space-y-1">
                                        {customerDetails.address.line1 && (
                                            <p>{customerDetails.address.line1}</p>
                                        )}
                                        {customerDetails.address.line2 && (
                                            <p className="text-lightColor">{customerDetails.address.line2}</p>
                                        )}
                                        <p>
                                            {[
                                                customerDetails.address.city,
                                                customerDetails.address.state,
                                                customerDetails.address.postal_code
                                            ].filter(Boolean).join(', ')}
                                        </p>
                                        {customerDetails.address.country && (
                                            <p className="font-medium uppercase text-xs">{customerDetails.address.country}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Payment & Shipping Method - Secondary Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Shipping Method */}
                        <div className="flex items-start gap-3 p-4 bg-baseColor/30 rounded-lg border border-borderColor">
                            <div className="w-10 h-10 rounded-full bg-white border border-borderColor flex items-center justify-center shrink-0">
                                <svg className="w-5 h-5 text-textColor" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <p className="text-xs text-lightColor font-medium mb-1">Shipping Method</p>
                                <p className="text-sm font-semibold text-textColor capitalize">
                                    {order.cartItem.chosenDeliveryType || 'Standard Delivery'}
                                </p>
                            </div>
                        </div>

                        {/* Payment Method */}
                        <div className="flex items-start gap-3 p-4 bg-baseColor/30 rounded-lg border border-borderColor">
                            <div className="w-10 h-10 rounded-full bg-white border border-borderColor flex items-center justify-center shrink-0">
                                <svg className="w-5 h-5 text-textColor" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <p className="text-xs text-lightColor font-medium mb-1">Payment Method</p>
                                {paymentMethod ? (
                                    <div className="text-sm font-semibold text-textColor">
                                        {paymentMethod.type === 'card' && (
                                            <div className="flex items-center gap-2">
                                                <span className="capitalize">{paymentMethod.card?.brand || 'Card'}</span>
                                                <span className="font-mono">•••• {paymentMethod.card?.last4}</span>
                                            </div>
                                        )}
                                        {paymentMethod.type === 'paynow' && <span>PayNow</span>}
                                        {paymentMethod.type === 'grabpay' && <span>GrabPay</span>}
                                        {!paymentMethod.type && <span>Stripe Checkout</span>}
                                    </div>
                                ) : (
                                    <p className="text-sm font-semibold text-textColor">Stripe Checkout</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Order Notes - Conditional Prominence */}
                    {order.cartItem.orderNote && (
                        <div className="border-l-4 border-amber-400 bg-amber-50 rounded-r-lg p-4">
                            <div className="flex items-start gap-3">
                                <svg className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                </svg>
                                <div className="flex-1">
                                    <h5 className="text-sm font-semibold text-amber-900 mb-2">Customer Note</h5>
                                    <p className="text-sm text-amber-800 leading-relaxed whitespace-pre-wrap">
                                        {order.cartItem.orderNote}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Support Information - Footer */}
                    <div className="flex items-center gap-2 pt-4 border-t border-borderColor">
                        <svg className="w-4 h-4 text-lightColor" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-xs text-lightColor">
                            Need help? Contact support with your order ID: <span className="font-mono font-medium text-textColor">{order._id.toString().slice(-8).toUpperCase()}</span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default OrderPage    