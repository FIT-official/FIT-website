'use client'
// Order history as card-per-order (reference: docs/account-ui-reference-images/
// order-history-1.png): each order is a white card with a canvas facts header
// (Order placed / Total / Items + order number and actions on the right), a
// status line ("Delivered 10 May 2026" when the timestamp is known), thumbnail
// item rows with one quiet meta line and icon actions (Buy again | View
// product | Message seller), and a one-line rate nudge on delivered orders.
// Above the cards: status
// ViewTabs (All / In progress / Delivered / Cancelled) and a time filter, both
// client-side. The PeekPanel keeps every legacy field (variants, fees,
// discounts, notes, delivery, custom-print tracking). Fetch logic is
// unchanged: /api/user/orders then /api/product?ids=; thumbnails resolve S3
// keys through /api/proxy?key= with a quiet letter/icon tile fallback.
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useUser } from '@clerk/nextjs'
import {
    IoChatbubbleEllipsesOutline,
    IoCopyOutline,
    IoCubeOutline,
    IoOpenOutline,
    IoRefreshOutline,
    IoStarOutline,
} from 'react-icons/io5'
import { ActionIcon, EmptyState, PeekPanel, StatusPill, SkeletonRow, ViewTabs } from '@/components/dashboard-ui'
import { useOrderStatuses, getStatusDisplayName } from '@/utils/useOrderStatuses'
import { useToast } from '../General/ToastProvider'
import { orderTone, money } from './accountUi'

// Status tab buckets, mapped from the real order status set (models/User.js).
const IN_PROGRESS_STATUSES = new Set([
    'pending', 'processing', 'confirmed', 'shipped', 'on_hold',
    'printing', 'printed', 'pending_config', 'configured',
])
const DELIVERED_STATUSES = new Set(['delivered', 'successful'])
const CANCELLED_STATUSES = new Set(['cancelled', 'failed', 'refunded', 'partially_refunded'])

const TIME_FILTERS = [
    { key: 'all', label: 'All time' },
    { key: 'year', label: 'Past year' },
    { key: '30d', label: 'Past 30 days' },
]

// Product thumbnail: S3 key through the image proxy; quiet fallback tile
// (initial letter for shop products, cube icon for custom prints), never a
// broken img.
function ItemThumb({ product, title, isCustomPrint, size = 56 }) {
    const imageKey = product?.images?.[0]
    const boxCls =
        'shrink-0 overflow-hidden rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] bg-[var(--dash-canvas)]'
    if (imageKey) {
        return (
            <div className={boxCls} style={{ height: size, width: size }}>
                <Image
                    src={`/api/proxy?key=${encodeURIComponent(imageKey)}`}
                    alt={title || 'Product'}
                    width={size}
                    height={size}
                    className="object-cover h-full w-full"
                />
            </div>
        )
    }
    return (
        <div
            className={`${boxCls} grid place-items-center text-[var(--dash-ink-faint)]`}
            style={{ height: size, width: size }}
            role="img"
            aria-label={title || 'Product'}
        >
            {isCustomPrint ? (
                <IoCubeOutline size={18} aria-hidden="true" />
            ) : (
                <span className="text-[15px] font-medium">{(title || '?').charAt(0).toUpperCase()}</span>
            )}
        </div>
    )
}

// Quiet label/value row (client polish, 2026-07-06): 12px ink-soft label
// left, value right. Replaces the dotted-leader rows in the orders UI;
// hairline dividers come from the surrounding group, not the row.
function QuietRow({ label, children, className = '' }) {
    return (
        <div className={`flex items-center justify-between gap-3 py-1 ${className}`}>
            <span className="text-[12px] text-[var(--dash-ink-soft)] shrink-0">{label}</span>
            <span className="dash-data min-w-0 flex items-center justify-end gap-1.5 text-right">
                {children}
            </span>
        </div>
    )
}

function OrderSection() {
    const [orders, setOrders] = useState([])
    const [paymentReviews, setPaymentReviews] = useState([])
    const [products, setProducts] = useState({})
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [selected, setSelected] = useState(null)
    const [statusTab, setStatusTab] = useState('all')
    const [timeFilter, setTimeFilter] = useState('all')
    const { orderStatuses } = useOrderStatuses() // Get all order statuses
    const { showToast } = useToast()
    const { user } = useUser()
    const viewerUserId = user?.id ? String(user.id) : null

    const isObjectIdString = (value) => typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)

    useEffect(() => {
        ;(async () => {
            setLoading(true)
            setError('')
            try {
                // Fetch orders
                const ordersRes = await fetch('/api/user/orders')
                if (!ordersRes.ok) throw new Error('Failed to fetch orders')
                const ordersData = await ordersRes.json()
                const ordersArr = ordersData.orders || []
                setOrders(ordersArr)
                setPaymentReviews(Array.isArray(ordersData.paymentReviews) ? ordersData.paymentReviews : [])

                const productIds = [
                    ...new Set(
                        ordersArr
                            .map((order) => order.cartItem?.productId)
                            .filter(Boolean)
                            .filter(isObjectIdString),
                    ),
                ]

                let productsMap = {}
                if (productIds.length > 0) {
                    const prodRes = await fetch(`/api/product?ids=${productIds.join(',')}`)
                    if (prodRes.ok) {
                        const prodData = await prodRes.json()
                        ;(prodData.products || []).forEach((prod) => {
                            productsMap[prod._id] = prod
                        })
                    }
                }
                // Custom-print orders whose pseudo id cannot resolve borrow the
                // canonical custom-print product (its photos + creator).
                const needsPrintFallback = ordersArr.some((order) => {
                    const pid = String(order.cartItem?.productId || '')
                    return (order.cartItem?.requestId || pid.startsWith('custom-print:')) && !productsMap[pid]
                })
                if (needsPrintFallback) {
                    try {
                        const printRes = await fetch('/api/product?productType=print')
                        if (printRes.ok) {
                            const printData = await printRes.json()
                            if (printData.products?.[0]) productsMap['custom-print'] = printData.products[0]
                        }
                    } catch { /* fallback tile covers it */ }
                }
                setProducts(productsMap)
            } catch (err) {
                setError(err.message || 'Failed to load orders.')
            }
            setLoading(false)
        })()
    }, [])

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text)
            showToast('Copied to clipboard!', 'success')
        } catch (err) {
            showToast('Failed to copy', 'error')
        }
    }

    // Message-seller CTA: only for catalogue products that still resolve, and
    // never when the buyer IS the creator. Custom prints are fulfilled by the
    // Custom prints are creator products too, so the CTA shows whenever the
    // product resolves to a creator who is not the viewer.
    const canMessageSeller = (d) => {
        const creatorId = d.product?.creatorUserId ? String(d.product.creatorUserId) : null
        if (!creatorId) return false
        return !(viewerUserId && viewerUserId === creatorId)
    }

    // The global ChatLauncher (app/layout.jsx) listens for this event. Products
    // fetched via /api/product?ids= carry creatorUserId but no display name, so
    // fall back to 'Seller'.
    const messageSeller = (d) => {
        if (typeof window === 'undefined') return
        window.dispatchEvent(
            new CustomEvent('fit:openCreatorChat', {
                detail: {
                    targetUserId: String(d.product.creatorUserId),
                    displayName: d.product.creatorDisplayName || 'Seller',
                    imageUrl: null,
                },
            }),
        )
    }

    // One quiet meta line under the item name: variant summary + quantity.
    const metaLine = (cartItem) => {
        const variants =
            cartItem.selectedVariants && Object.keys(cartItem.selectedVariants).length > 0
                ? Object.values(cartItem.selectedVariants).join(', ')
                : null
        return [variants, `Qty ${cartItem.quantity || 1}`].filter(Boolean).join(', ')
    }

    const decorate = (order) => {
        const cartItem = order.cartItem || {}
        const isCustomPrint =
            Boolean(cartItem.requestId) || String(cartItem.productId || '').startsWith('custom-print:')
        const product =
            products[cartItem.productId] || (isCustomPrint ? products['custom-print'] : null) || {}
        const displayTitle = isCustomPrint
            ? 'Custom 3D Print' // request ids are admin-facing only
            : product.name || cartItem.productId
        // "Delivered 10 May" facts come from the real statusHistory timestamp;
        // omitted honestly when no history entry exists.
        const deliveredAt = (order.statusHistory || []).find((h) => h.status === 'delivered')?.timestamp
        return { order, cartItem, isCustomPrint, product, displayTitle, deliveredAt }
    }

    const sorted = useMemo(
        () => [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
        [orders],
    )

    // Header-strip totals across the whole history (item count + spend).
    const totals = useMemo(() => {
        return sorted.reduce(
            (acc, order) => {
                const item = order.cartItem || {}
                acc.items += item.quantity || 1
                acc.spend += (item.price || 0) * (item.quantity || 1)
                return acc
            },
            { items: 0, spend: 0 },
        )
    }, [sorted])

    // Time filter first, then status tab, both client-side.
    const inTimeWindow = useMemo(() => {
        if (timeFilter === 'all') return sorted
        const cutoff = timeFilter === 'year' ? dayjs().subtract(1, 'year') : dayjs().subtract(30, 'day')
        return sorted.filter((order) => dayjs(order.createdAt).isAfter(cutoff))
    }, [sorted, timeFilter])

    const bucketOf = (status) => {
        if (DELIVERED_STATUSES.has(status)) return 'delivered'
        if (CANCELLED_STATUSES.has(status)) return 'cancelled'
        if (IN_PROGRESS_STATUSES.has(status)) return 'in_progress'
        return 'other'
    }

    const statusTabs = useMemo(() => {
        const counts = { all: inTimeWindow.length, in_progress: 0, delivered: 0, cancelled: 0 }
        inTimeWindow.forEach((order) => {
            const bucket = bucketOf(order.status)
            if (counts[bucket] !== undefined) counts[bucket] += 1
        })
        return [
            { key: 'all', label: 'All', count: counts.all },
            { key: 'in_progress', label: 'In progress', count: counts.in_progress },
            { key: 'delivered', label: 'Delivered', count: counts.delivered },
            { key: 'cancelled', label: 'Cancelled', count: counts.cancelled },
        ]
    }, [inTimeWindow])

    const visible = useMemo(() => {
        if (statusTab === 'all') return inTimeWindow
        return inTimeWindow.filter((order) => bucketOf(order.status) === statusTab)
    }, [inTimeWindow, statusTab])

    const peek = selected ? decorate(selected) : null
    const variantFees = peek?.cartItem?.variantInfo
        ? peek.cartItem.variantInfo.reduce((sum, v) => sum + (v.additionalFee || 0), 0)
        : 0

    const rowActionCls =
        'dash-hoverable inline-flex h-7 items-center rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 text-[12px] font-medium dash-soft hover:text-[var(--dash-ink)] hover:bg-[var(--dash-canvas)] whitespace-nowrap'

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 className="dash-title">Orders</h2>
                {!loading && sorted.length > 0 && (
                    <div className="flex items-center gap-5">
                        <div>
                            <p className="dash-label">Items</p>
                            <p className="dash-data">{totals.items}</p>
                        </div>
                        <div>
                            <p className="dash-label">Total spent</p>
                            <p className="dash-data">S${money(totals.spend)}</p>
                        </div>
                    </div>
                )}
            </div>

            {loading && (
                <div className="flex flex-col gap-2">
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                </div>
            )}
            {error && <p className="text-[12px] font-medium text-[var(--dash-bad)]">{error}</p>}

            {!loading && !error && paymentReviews.length > 0 && <section aria-label="Payments under review" className="flex flex-col gap-3">
                {paymentReviews.map(review => <article key={review.sessionId} className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
                    <h3 className="font-semibold">Payment received — order details under review</h3>
                    <p className="mt-2 text-sm">We received your payment and are checking the order details. Please do not pay again. Contact FIT if you need help.</p>
                    <p className="mt-3 text-sm font-medium">{String(review.receipt?.currency || '').toUpperCase()} {money((review.receipt?.amountTotalCents || 0) / 100)}</p>
                    {review.receipt?.recordedAt && <p className="mt-1 text-sm">Recorded {dayjs(review.receipt.recordedAt).format('D MMM YYYY')}</p>}
                    <p className="mt-2 break-all text-xs">Payment reference: {review.sessionId}</p>
                </article>)}
            </section>}

            {!loading && !error && sorted.length === 0 && paymentReviews.length === 0 && (
                <div className="bg-[var(--dash-card)] border border-[var(--dash-line)] rounded-[var(--dash-r-card)]">
                    <EmptyState
                        title="No Orders Yet"
                        body="Everything you buy shows up here with live status."
                        secondary="Browse the shop"
                        onSecondary={() => {
                            window.location.href = '/shop'
                        }}
                    />
                </div>
            )}

            {!loading && sorted.length > 0 && (
                <>
                    {/* Saved-view tabs own the scroll region; the time filter sits shrink-0 right (§10.3). */}
                    <div className="flex items-center gap-3">
                        <ViewTabs
                            tabs={statusTabs}
                            active={statusTab}
                            onChange={setStatusTab}
                            className="min-w-0 flex-1"
                        />
                        <select
                            value={timeFilter}
                            onChange={(e) => setTimeFilter(e.target.value)}
                            aria-label="Filter orders by time"
                            className="dash-hoverable h-8 shrink-0 cursor-pointer rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 text-[12px] font-medium text-[var(--dash-ink-soft)] hover:text-[var(--dash-ink)]"
                        >
                            {TIME_FILTERS.map((f) => (
                                <option key={f.key} value={f.key}>
                                    {f.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {visible.length === 0 && (
                        <p className="text-[13px] dash-soft px-1">No orders match this view.</p>
                    )}

                    <div className="flex flex-col gap-4">
                        {visible.map((order) => {
                            const d = decorate(order)
                            const shortId = order._id?.slice(-8).toUpperCase() || 'N/A'
                            const canBuyAgain = !d.isCustomPrint && Boolean(d.product?.slug)
                            return (
                                <article
                                    key={order._id}
                                    className="bg-[var(--dash-card)] border border-[var(--dash-line)] rounded-[var(--dash-r-card)] shadow-[var(--dash-shadow-card)] overflow-hidden"
                                >
                                    {/* Facts header: date / total / items left, order number + actions right. */}
                                    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 bg-[var(--dash-canvas)] border-b border-[var(--dash-line)] px-5 py-3">
                                        <div>
                                            <p className="dash-label">Order placed</p>
                                            <p className="dash-data mt-0.5">{dayjs(order.createdAt).format('D MMM YYYY')}</p>
                                        </div>
                                        <div>
                                            <p className="dash-label">Total</p>
                                            <p className="dash-data mt-0.5">
                                                {d.cartItem.currency || 'S'}$
                                                {money((d.cartItem.price || 0) * (d.cartItem.quantity || 1))}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="dash-label">Items</p>
                                            <p className="dash-data mt-0.5">
                                                {d.cartItem.quantity || 1} item{(d.cartItem.quantity || 1) === 1 ? '' : 's'}
                                            </p>
                                        </div>
                                        <div className="ml-auto flex items-center gap-2">
                                            <span className="dash-data dash-soft font-mono">#{shortId}</span>
                                            <ActionIcon
                                                icon={IoCopyOutline}
                                                label={`Copy order ID ${shortId}`}
                                                onClick={() => copyToClipboard(order._id)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setSelected(order)}
                                                className={rowActionCls}
                                            >
                                                Quick view
                                            </button>
                                            <Link
                                                href={`/account/orders/${order._id}`}
                                                className="dash-hoverable inline-flex h-7 items-center rounded-full bg-[var(--dash-ink)] text-[var(--dash-canvas)] px-3 text-[12px] font-medium whitespace-nowrap"
                                            >
                                                View order
                                            </Link>
                                        </div>
                                    </header>

                                    <div className="px-5 py-4 flex flex-col gap-4">
                                        {/* Status line, with the real delivered date when history carries it. */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <StatusPill tone={orderTone(order.status)}>
                                                {getStatusDisplayName(order.status, orderStatuses)}
                                            </StatusPill>
                                            {d.deliveredAt && (
                                                <span className="dash-data dash-soft">
                                                    on {dayjs(d.deliveredAt).format('D MMM YYYY')}
                                                </span>
                                            )}
                                            {order.trackingId && (
                                                <span className="dash-data dash-soft">
                                                    Tracking {order.trackingId}
                                                </span>
                                            )}
                                        </div>

                                        {/* Item row: thumbnail + name lead; one quiet meta line;
                                            quiet icon actions. */}
                                        <div className="flex flex-wrap items-center gap-3">
                                            <ItemThumb
                                                product={d.product}
                                                title={d.displayTitle}
                                                isCustomPrint={d.isCustomPrint}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[13px] font-medium truncate">{d.displayTitle}</p>
                                                <p className="dash-data dash-soft truncate mt-0.5">
                                                    {metaLine(d.cartItem)}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                                                {canBuyAgain && (
                                                    <Link href={`/products/${d.product.slug}`} className={rowActionCls}>
                                                        <IoRefreshOutline size={13} aria-hidden="true" className="mr-1.5" />
                                                        Buy again
                                                    </Link>
                                                )}
                                                {canBuyAgain && (
                                                    <Link href={`/products/${d.product.slug}`} className={rowActionCls}>
                                                        <IoOpenOutline size={13} aria-hidden="true" className="mr-1.5" />
                                                        View product
                                                    </Link>
                                                )}
                                                {d.isCustomPrint && (
                                                    <Link href="/account/prints" className={rowActionCls}>
                                                        <IoCubeOutline size={13} aria-hidden="true" className="mr-1.5" />
                                                        Track print
                                                    </Link>
                                                )}
                                                {canMessageSeller(d) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => messageSeller(d)}
                                                        className={`${rowActionCls} cursor-pointer`}
                                                    >
                                                        <IoChatbubbleEllipsesOutline
                                                            size={13}
                                                            aria-hidden="true"
                                                            className="mr-1.5"
                                                        />
                                                        Message seller
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* One short line + one action on delivered shop orders. */}
                                        {DELIVERED_STATUSES.has(order.status) && canBuyAgain && (
                                            <div className="flex items-center gap-2 border-t border-[var(--dash-line)] pt-3">
                                                <IoStarOutline
                                                    size={14}
                                                    aria-hidden="true"
                                                    className="shrink-0 text-[var(--dash-ink-soft)]"
                                                />
                                                <p className="min-w-0 flex-1 text-[12px] dash-soft">How was it?</p>
                                                <Link href={`/products/${d.product.slug}#reviews`} className={rowActionCls}>
                                                    Rate it
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                </article>
                            )
                        })}
                    </div>
                </>
            )}

            <PeekPanel
                open={!!peek}
                onClose={() => setSelected(null)}
                title={peek ? `Order #${peek.order._id?.slice(-8).toUpperCase() || 'N/A'}` : ''}
                actions={
                    peek && (
                        <Link
                            href={`/account/orders/${peek.order._id}`}
                            className="dash-hoverable rounded-full bg-[var(--dash-ink)] text-[var(--dash-canvas)] px-3.5 py-1.5 text-[12px] font-medium whitespace-nowrap"
                        >
                            View full order
                        </Link>
                    )
                }
            >
                {peek && (
                    <div className="flex flex-col gap-6">
                        <section className="flex flex-wrap items-center gap-2">
                            <StatusPill tone={orderTone(peek.order.status)}>
                                {getStatusDisplayName(peek.order.status, orderStatuses)}
                            </StatusPill>
                            {/* Print status for print orders, when it diverges. */}
                            {peek.order.orderType === 'printOrder' &&
                                peek.order.printStatus &&
                                peek.order.printStatus !== peek.order.status && (
                                    <StatusPill tone={orderTone(peek.order.printStatus)}>
                                        Print: {getStatusDisplayName(peek.order.printStatus, orderStatuses)}
                                    </StatusPill>
                                )}
                        </section>

                        <section className="flex gap-3 items-center">
                            <ItemThumb
                                product={peek.product}
                                title={peek.displayTitle}
                                isCustomPrint={peek.isCustomPrint}
                            />
                            <div className="min-w-0">
                                <p className="text-[13px] font-medium truncate">{peek.displayTitle}</p>
                                {peek.product.description && (
                                    <p className="dash-data dash-soft truncate">{peek.product.description}</p>
                                )}
                            </div>
                        </section>

                        <section>
                            <h4 className="dash-label mb-1">Order</h4>
                            <QuietRow label="Order ID">
                                #{peek.order._id?.slice(-8).toUpperCase()}
                                <ActionIcon
                                    icon={IoCopyOutline}
                                    label="Copy order ID"
                                    onClick={() => copyToClipboard(peek.order._id)}
                                    className="h-6 w-6"
                                />
                            </QuietRow>
                            <QuietRow label="Placed">
                                {peek.order.createdAt ? dayjs(peek.order.createdAt).format('D MMM YYYY, HH:mm') : 'Unknown'}
                            </QuietRow>
                            <QuietRow label="Quantity">{peek.cartItem.quantity}</QuietRow>
                            <QuietRow label="Delivery">
                                <span className="capitalize">{peek.cartItem.chosenDeliveryType || 'Not specified'}</span>
                            </QuietRow>
                            {peek.order.trackingId && (
                                <QuietRow label="Tracking ID">
                                    {peek.order.trackingId}
                                    <ActionIcon
                                        icon={IoCopyOutline}
                                        label="Copy tracking ID"
                                        onClick={() => copyToClipboard(peek.order.trackingId)}
                                        className="h-6 w-6"
                                    />
                                </QuietRow>
                            )}
                        </section>

                        {/* Selected options (new variant system) with their fees. */}
                        {peek.cartItem.selectedVariants && Object.keys(peek.cartItem.selectedVariants).length > 0 && (
                            <section>
                                <h4 className="dash-label mb-1">Options</h4>
                                {Object.entries(peek.cartItem.selectedVariants).map(([type, option]) => {
                                    const variantInfoItem = peek.cartItem.variantInfo?.find(
                                        (v) => v.type === type && v.option === option,
                                    )
                                    const fee = variantInfoItem?.additionalFee || 0
                                    return (
                                        <QuietRow key={type} label={type}>
                                            {option}
                                            {fee > 0 ? ` (+S$${money(fee)})` : ''}
                                        </QuietRow>
                                    )
                                })}
                            </section>
                        )}
                        {/* Legacy variant selection fallback. */}
                        {(!peek.cartItem.selectedVariants ||
                            Object.keys(peek.cartItem.selectedVariants).length === 0) &&
                            peek.cartItem.variantId && (
                                <section>
                                    <h4 className="dash-label mb-1">Options</h4>
                                    <QuietRow label="Variant">{peek.cartItem.variantId}</QuietRow>
                                </section>
                            )}

                        <section>
                            <h4 className="dash-label mb-1">Payment</h4>
                            {peek.cartItem.basePrice > 0 && (
                                <QuietRow label="Base price">S${money(peek.cartItem.basePrice)}</QuietRow>
                            )}
                            {variantFees > 0 && (
                                <QuietRow label="Option fees">+S${money(variantFees)}</QuietRow>
                            )}
                            {peek.cartItem.priceBeforeDiscount &&
                                peek.cartItem.finalPrice &&
                                peek.cartItem.priceBeforeDiscount !== peek.cartItem.finalPrice && (
                                    <QuietRow label="Discount">
                                        <span className="text-[var(--dash-ok)]">
                                            -
                                            {(
                                                ((peek.cartItem.priceBeforeDiscount - peek.cartItem.finalPrice) /
                                                    peek.cartItem.priceBeforeDiscount) *
                                                100
                                            ).toFixed(0)}
                                            %
                                        </span>
                                    </QuietRow>
                                )}
                            <QuietRow label="Paid">
                                {peek.cartItem.currency || 'S'}$
                                {money(
                                    (peek.cartItem.finalPrice || peek.cartItem.price || 0) *
                                        (peek.cartItem.quantity || 1),
                                )}
                            </QuietRow>
                            {peek.cartItem.deliveryFee > 0 && (
                                <QuietRow label="Delivery fee">
                                    +S${money(peek.cartItem.deliveryFee * (peek.cartItem.quantity || 1))}
                                </QuietRow>
                            )}
                            {/* Total: plain row, emphasized value (15px/600). */}
                            <div className="mt-1 flex items-center justify-between gap-3 border-t border-[var(--dash-line)] pt-2">
                                <span className="text-[12px] font-medium text-[var(--dash-ink)]">Total</span>
                                <span className="text-[15px] font-semibold tabular-nums">
                                    {peek.cartItem.currency || 'S'}$
                                    {money((peek.cartItem.price || 0) * (peek.cartItem.quantity || 1))}
                                </span>
                            </div>
                        </section>

                        {peek.cartItem.orderNote && (
                            <section className="bg-[var(--dash-canvas)] border border-[var(--dash-line)] rounded-[var(--dash-r-inner)] px-3 py-2.5">
                                <h4 className="dash-label">Your note</h4>
                                <p className="mt-1 text-[13px] whitespace-pre-wrap">{peek.cartItem.orderNote}</p>
                            </section>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                            {peek.isCustomPrint && (
                                <Link
                                    href="/account/prints"
                                    className="dash-hoverable inline-flex w-fit items-center rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3.5 py-1.5 text-[12px] font-medium dash-soft hover:text-[var(--dash-ink)] hover:bg-[var(--dash-canvas)]"
                                >
                                    Track print
                                </Link>
                            )}

                            {/* Delivered shop orders get a one-tap route back to the product. */}
                            {peek.order.status === 'delivered' && peek.product?.slug && (
                                <Link
                                    href={`/products/${peek.product.slug}`}
                                    className="dash-hoverable inline-flex w-fit items-center rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3.5 py-1.5 text-[12px] font-medium dash-soft hover:text-[var(--dash-ink)] hover:bg-[var(--dash-canvas)]"
                                >
                                    Order again
                                </Link>
                            )}

                            {canMessageSeller(peek) && (
                                <button
                                    type="button"
                                    onClick={() => messageSeller(peek)}
                                    className="dash-hoverable inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3.5 py-1.5 text-[12px] font-medium dash-soft hover:text-[var(--dash-ink)] hover:bg-[var(--dash-canvas)]"
                                >
                                    <IoChatbubbleEllipsesOutline size={13} aria-hidden="true" />
                                    Message seller
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </PeekPanel>
        </div>
    )
}

export default OrderSection
