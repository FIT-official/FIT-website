'use client'

// Creator home — "the morning desk" (blueprint §5.2).
// Hero: greeting and revenue chart.
// The rail lives in CreatorShell (app/dashboard/layout).
// Shop display name comes from ShopIdentityContext.

import { useEffect, useMemo, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import Link from 'next/link'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { motion } from 'framer-motion'
import { staggerParent, staggerChild } from '@/lib/motion/tokens'
import {
    DashCard,
    HeroGreeting,
    SegmentPill,
    StatTile,
} from '@/components/dashboard-ui'
import { useShopIdentity } from '@/components/DashboardComponents/CreatorShell'
import RevenueCard from '@/components/DashboardComponents/RevenueCard'
import OrdersLedger from '@/components/DashboardComponents/OrdersLedger'
import ExpressWidget from '@/components/DashboardComponents/ExpressWidget'
import SetupChecklist from '@/components/DashboardComponents/SetupChecklist'
import {
    currencyPrefix,
    formatMoney,
} from '@/components/DashboardComponents/format'
import CreatorTermsCard from '@/components/Legal/CreatorTermsCard'

dayjs.extend(relativeTime)

function salutationFor(hour) {
    if (hour < 12) return 'Good morning,'
    if (hour < 18) return 'Good afternoon,'
    return 'Good evening,'
}

const isRawUserId = value =>
    typeof value === 'string' &&
    /^user_[a-zA-Z0-9]+$/.test(value.trim())

function Dashboard({ creatorTermsRequired = false }) {
    const { user, isLoaded } = useUser()
    const { displayName } = useShopIdentity()

    const [myProducts, setMyProducts] = useState([])
    const [orders, setOrders] = useState([])
    const [ordersUpdatedAt, setOrdersUpdatedAt] = useState(null)
    const [unreadMessages, setUnreadMessages] = useState(0)

    // Read the hour after mounting to avoid hydration mismatch.
    const [hour, setHour] = useState(null)

    useEffect(() => {
        setHour(new Date().getHours())
    }, [])

    useEffect(() => {
        if (!user || !isLoaded) return

        const fetchProducts = async () => {
            const res = await fetch(
                `/api/product?creatorUserId=${user.id}`
            )
            const data = await res.json()
            setMyProducts(data.products || [])
        }

        fetchProducts()
    }, [user, isLoaded])

    // Orders across all of this creator's products.
    useEffect(() => {
        if (!user || myProducts.length === 0) return

        const fetchOrders = async () => {
            const productIds = myProducts.map(p => p._id)

            const res = await fetch('/api/user/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ productIds }),
            })

            const users = await res.json()

            const myProductMap = Object.fromEntries(
                myProducts.map(p => [p._id, p.name])
            )

            const results = []
            const userList = Array.isArray(users) ? users : []

            userList.forEach(u => {
                if (
                    !u.orderHistory ||
                    !Array.isArray(u.orderHistory)
                ) {
                    return
                }

                u.orderHistory.forEach(order => {
                    const item = order.cartItem

                    if (
                        item &&
                        productIds.includes(item.productId)
                    ) {
                        results.push({
                            productId: item.productId,
                            productName:
                                myProductMap[item.productId],
                            buyerId: u.userId,
                            buyerFirstName: u.firstName || '',
                            buyerEmail:
                                u.emailAddresses?.[0]
                                    ?.emailAddress || '',
                            orderStatus: order.status,
                            orderType:
                                order.orderType || 'order',
                            printStatus:
                                order.printStatus || null,
                            quantity: item.quantity,
                            orderedAt: order.createdAt,
                            orderId: order._id,
                            contact: u.contact || null,
                            orderNote: item.orderNote || '',
                            deliveryType:
                                item.chosenDeliveryType || '',
                            price: item.price || 0,
                            printConfiguration:
                                order.printConfiguration || null,
                            trackingId:
                                order.trackingId || null,
                        })
                    }
                })
            })

            setOrders(results)
            setOrdersUpdatedAt(new Date())
        }

        fetchOrders()
    }, [user, myProducts])

    // Best-effort unread-message indicator.
    useEffect(() => {
        if (!user || !isLoaded) return

        let cancelled = false

        ;(async () => {
            try {
                const res = await fetch('/api/chat/inbox')
                if (!res.ok) return

                const data = await res.json()

                const unread = (data.channels || []).reduce(
                    (acc, channel) =>
                        acc + (channel.unreadCount || 0),
                    0
                )

                if (!cancelled) {
                    setUnreadMessages(unread)
                }
            } catch {
                // Hide this optional indicator on error.
            }
        })()

        return () => {
            cancelled = true
        }
    }, [user, isLoaded])

    const prefix = currencyPrefix(
        myProducts.find(
            p => p?.basePrice?.presentmentCurrency
        )?.basePrice?.presentmentCurrency
    )

    const ordersThisMonth = useMemo(
        () =>
            orders.filter(o =>
                dayjs(o.orderedAt).isSame(dayjs(), 'month')
            ).length,
        [orders]
    )

    const pendingOrders = useMemo(
        () =>
            orders.filter(
                o => o.orderStatus === 'pending'
            ).length,
        [orders]
    )

    const {
        grossThisMonth,
        grossLastMonth,
    } = useMemo(() => {
        let cur = 0
        let last = 0
        const now = dayjs()

        myProducts.forEach(product => {
            ;(product?.sales || []).forEach(sale => {
                if (!sale?.createdAt) return

                const gross =
                    (sale.quantity || 0) *
                    (sale.price || 0)

                const at = dayjs(sale.createdAt)

                if (at.isSame(now, 'month')) {
                    cur += gross
                } else if (
                    at.isSame(
                        now.subtract(1, 'month'),
                        'month'
                    )
                ) {
                    last += gross
                }
            })
        })

        return {
            grossThisMonth: cur,
            grossLastMonth: last,
        }
    }, [myProducts])

    const grossDelta =
        grossLastMonth > 0
            ? Math.round(
                (
                    (grossThisMonth - grossLastMonth) /
                    grossLastMonth
                ) * 100
            )
            : null

    const totalLikes = myProducts.reduce(
        (acc, product) =>
            acc +
            (
                Array.isArray(product.likes)
                    ? product.likes.length
                    : Number(product.likes) || 0
            ),
        0
    )

    const totalDownloads = myProducts.reduce(
        (acc, product) =>
            acc + (product.downloads || 0),
        0
    )

    const avgRating =
        myProducts.length > 0
            ? (
                myProducts.reduce(
                    (acc, product) =>
                        acc + (product.rating || 0),
                    0
                ) / myProducts.length
            ).toFixed(1)
            : null

    const attention = useMemo(() => {
        const rows = []

        if (unreadMessages > 0) {
            rows.push({
                key: 'unread',
                label:
                    `${unreadMessages} unread message` +
                    (unreadMessages === 1 ? '' : 's'),
                href: '/dashboard/messages',
            })
        }

        if (pendingOrders > 0) {
            rows.push({
                key: 'ship',
                label:
                    `${pendingOrders} order` +
                    (pendingOrders === 1 ? '' : 's') +
                    ' awaiting shipment',
                href: '#orders',
            })
        }

        myProducts.forEach(product => {
            const lowStock = (
                product.variantTypes || []
            )
                .flatMap(type => type.options || [])
                .filter(
                    option =>
                        typeof option.stock === 'number' &&
                        option.stock <= 2
                ).length

            if (lowStock > 0) {
                rows.push({
                    key: `stock-${product._id}`,
                    label: `Low stock: ${product.name}`,
                    href:
                        `/dashboard/products/edit/${product._id}`,
                })
            }
        })

        return rows.slice(0, 5)
    }, [
        unreadMessages,
        pendingOrders,
        myProducts,
    ])

    if (!isLoaded) {
        return (
            <div className="flex w-full items-center justify-center py-32">
                <div className="loader" />
            </div>
        )
    }

    const heroName =
        displayName && !isRawUserId(displayName)
            ? displayName
            : user?.fullName || 'there'

    return (
        <div className="flex flex-col gap-4">
            {creatorTermsRequired && (
                <CreatorTermsCard />
            )}

            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-2">
                <HeroGreeting
                    salutation={
                        hour === null
                            ? 'Hello,'
                            : salutationFor(hour)
                    }
                    name={heroName}
                    context={
                        `${dayjs().format('dddd D MMMM YYYY')}, ` +
                        `${ordersThisMonth} order` +
                        (ordersThisMonth === 1 ? '' : 's') +
                        ' this month'
                    }
                />

                {attention.length > 0 && (
                    <div className="md:max-w-[280px] shrink-0">
                        <span className="dash-label">
                            Needs attention
                        </span>

                        <ul className="mt-1.5 flex flex-col gap-1">
                            {attention.map(row => (
                                <li key={row.key}>
                                    <Link
                                        href={row.href}
                                        className="flex items-center gap-2 text-[13px] hover:underline"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="h-1.5 w-1.5 rounded-full bg-[var(--dash-ink)] shrink-0"
                                        />

                                        <span className="truncate">
                                            {row.label}
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* Setup checklist — below needs-attention. */}
            <SetupChecklist
                user={user}
                isLoaded={isLoaded}
                displayName={displayName}
                hasProduct={myProducts.length > 0}
                hasSale={orders.length > 0}
            />

            {/* First-mount stagger for the analytics tiles. */}
            <motion.div
                variants={staggerParent}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
                <motion.div
                    variants={staggerChild}
                    className="md:col-span-2 md:row-span-3 min-w-0"
                >
                    <RevenueCard
                        products={myProducts}
                        prefix={prefix}
                    />
                </motion.div>

                <motion.div
                    variants={staggerChild}
                    className="min-w-0"
                >
                    <StatTile
                        label="Gross volume"
                        value={
                            `${prefix}${formatMoney(grossThisMonth)}`
                        }
                        variant="ink"
                        delta={grossDelta}
                        hint="this month"
                    />
                </motion.div>

                <motion.div
                    variants={staggerChild}
                    className="min-w-0"
                >
                    <StatTile
                        label="Orders"
                        value={orders.length}
                        hint="all time"
                    />
                </motion.div>

                <motion.div
                    variants={staggerChild}
                    className="min-w-0"
                >
                    <DashCard className="h-full">
                        <span className="dash-label">
                            Store at a glance
                        </span>

                        <SegmentPill
                            className="mt-3"
                            segments={[
                                {
                                    label: 'Likes',
                                    value: totalLikes,
                                    tone: 'sun',
                                },
                                {
                                    label: 'Downloads',
                                    value: totalDownloads,
                                    tone: 'ink',
                                },
                                {
                                    label: 'Products',
                                    value: myProducts.length,
                                    tone: 'hatch',
                                },
                            ]}
                        />

                        <p className="dash-data dash-soft mt-3">
                            Avg rating {avgRating ?? 'n/a'},
                            {' '}joined{' '}
                            {user?.createdAt
                                ? dayjs(user.createdAt).fromNow(true)
                                : 'recently'}{' '}
                            ago
                        </p>
                    </DashCard>
                </motion.div>
            </motion.div>

            <div id="orders">
                <OrdersLedger
                    orders={orders}
                    prefix={prefix}
                    updatedAt={ordersUpdatedAt}
                    onPatch={(orderId, patch) =>
                        setOrders(prev =>
                            prev.map(order =>
                                order.orderId === orderId
                                    ? {
                                        ...order,
                                        ...patch,
                                    }
                                    : order
                            )
                        )
                    }
                />
            </div>

            <div id="stripe-payouts">
                <ExpressWidget
                    user={user}
                    isLoaded={isLoaded}
                />
            </div>
        </div>
    )
}

export default Dashboard
