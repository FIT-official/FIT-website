'use client'
import { useState, useEffect, useMemo } from 'react'
import { useToast } from '@/components/General/ToastProvider'
import { IoDownloadOutline, IoCardOutline } from 'react-icons/io5'
import * as XLSX from 'xlsx'
import {
    StatTile,
    ViewTabs,
    GlassBar,
    StatusPill,
    DottedRow,
    LedgerTable,
    PeekPanel,
    EmptyState,
    SkeletonRow,
    FreshnessStamp,
} from '@/components/dashboard-ui'
import { barSelectCls, barDateCls, quietPillCls, useUrlSub } from './dashPanelUi'

// Payments as accounting (blueprint §9.10): three sub-views over the same
// loaded sessions — the ledger, the payout run, and the month statements.
const SUB_VIEWS = [
    { key: 'transactions', label: 'Transactions' },
    { key: 'byCreator', label: 'By creator' },
    { key: 'statements', label: 'Statements' },
]

const money = (cents) => `$${(cents / 100).toFixed(2)}`

const unitPriceLabel = (unitPrice) =>
    `$${typeof unitPrice === 'number' ? unitPrice.toFixed(2) : (unitPrice / 100).toFixed(2)}`

/**
 * Product-vs-shipping split as a bar-only pill: the amounts stay off the
 * screen at rest and surface in the hover tooltip (client directive). Ink =
 * product revenue, hatch = shipping.
 */
function RevenueSplitBar({ productCents, shippingCents }) {
    const total = Math.max(productCents + shippingCents, 1)
    const label = `Product ${money(productCents)} / Shipping ${money(shippingCents)}`
    return (
        <div
            role="img"
            aria-label={label}
            title={label}
            className="flex h-4 max-w-[220px] rounded-full overflow-hidden border border-[var(--dash-line)]"
        >
            <div
                className="bg-[var(--dash-ink)]"
                title={`Product ${money(productCents)}`}
                style={{ width: `${(Math.max(0, productCents) / total) * 100}%` }}
            />
            <div className="dash-hatch bg-[var(--dash-card)] flex-1" title={`Shipping ${money(shippingCents)}`} />
        </div>
    )
}

export default function CreatorPayments() {
    const { showToast } = useToast()
    const [sessions, setSessions] = useState([])
    const [paymentReviews, setPaymentReviews] = useState([])
    const [fetchedAt, setFetchedAt] = useState(null)
    const [sessionsLoading, setSessionsLoading] = useState(false)
    const [sessionFilter, setSessionFilter] = useState('pending')
    const [enrichedSessions, setEnrichedSessions] = useState([])
    const [productCache, setProductCache] = useState({})
    const [userCache, setUserCache] = useState({})
    const [subView, setSubView] = useUrlSub(SUB_VIEWS.map((v) => v.key), 'transactions')
    const [peekSessionId, setPeekSessionId] = useState(null)

    // Date range states
    const [dateRange, setDateRange] = useState('all')
    const [customStartDate, setCustomStartDate] = useState('')
    const [customEndDate, setCustomEndDate] = useState('')
    const [showDatePicker, setShowDatePicker] = useState(false)

    useEffect(() => {
        fetchSessions()
    }, [sessionFilter, dateRange, customStartDate, customEndDate])

    const enrichSessionsWithData = async (sessions) => {
        const uniqueUserIds = new Set()
        const uniqueProductIds = new Set()

        sessions.forEach(session => {
            // Add buyer
            uniqueUserIds.add(session.userId)

            // Add creators
            Object.keys(session.salesData).forEach(creatorId => {
                uniqueUserIds.add(creatorId)
            })

            // Add products
            Object.values(session.salesData).forEach(saleData => {
                saleData.items.forEach(item => {
                    uniqueProductIds.add(item.productId)
                })
            })
        })

        // Batch fetch all users and products in parallel and get returned data
        const [fetchedUsers, fetchedProducts] = await Promise.all([
            fetchBatchUsers(Array.from(uniqueUserIds)),
            fetchBatchProducts(Array.from(uniqueProductIds))
        ])

        // Build temporary lookup maps from returned data
        const userLookup = {}
        fetchedUsers.forEach(user => {
            if (user && user.id) {
                userLookup[user.id] = user
            }
        })

        const productLookup = {}
        fetchedProducts.forEach(product => {
            if (product && product._id) {
                productLookup[product._id] = product
            }
        })

        const enrichedSessionsData = sessions.map(session => {
            const enrichedSession = { ...session, enrichedData: {} }

            // Add buyer data
            enrichedSession.enrichedData.buyer = userLookup[session.userId]

            // Add creator data and items
            Object.entries(session.salesData).forEach(([creatorId, saleData]) => {
                const creatorData = userLookup[creatorId]
                enrichedSession.enrichedData[creatorId] = { user: creatorData, items: [] }

                // Add product data for each item
                saleData.items.forEach(item => {
                    const productData = productLookup[item.productId]
                    const variant = productData?.variants?.find(v => v._id === item.variantId)

                    enrichedSession.enrichedData[creatorId].items.push({
                        ...item,
                        productName: productData?.name || 'Unknown Product',
                        variantName: variant?.name || 'Unknown Variant'
                    })
                })
            })

            return enrichedSession
        })

        return enrichedSessionsData
    }

    const fetchBatchUsers = async (userIds) => {
        // Check cache first and separate cached vs uncached
        const cachedUsers = []
        const uncachedIds = []

        userIds.forEach(id => {
            if (userCache[id]) {
                cachedUsers.push(userCache[id])
            } else {
                uncachedIds.push(id)
            }
        })

        if (uncachedIds.length === 0) {
            return cachedUsers
        }

        // Fetch in batches of 10 to avoid URL length limits
        const batchSize = 10
        const batches = []
        for (let i = 0; i < uncachedIds.length; i += batchSize) {
            batches.push(uncachedIds.slice(i, i + batchSize))
        }

        try {
            const results = await Promise.all(
                batches.map(async (batch) => {
                    const response = await fetch(`/api/user/batch?ids=${batch.join(',')}`)
                    if (response.ok) {
                        const data = await response.json()
                        return data.users || []
                    }
                    console.error('Failed to fetch batch, status:', response.status)
                    return []
                })
            )
            const fetchedUsers = results.flat()

            // Update cache with all fetched users at once
            const newCacheEntries = {}
            fetchedUsers.forEach(user => {
                if (user && user.id) {
                    newCacheEntries[user.id] = user
                }
            })

            setUserCache(prev => ({ ...prev, ...newCacheEntries }))

            return [...cachedUsers, ...fetchedUsers]
        } catch (error) {
            console.error('Failed to fetch batch users:', error)
            return cachedUsers
        }
    }

    const fetchBatchProducts = async (productIds) => {
        // Check cache first and separate cached vs uncached
        const cachedProducts = []
        const uncachedIds = []

        productIds.forEach(id => {
            if (productCache[id]) {
                cachedProducts.push(productCache[id])
            } else {
                uncachedIds.push(id)
            }
        })

        if (uncachedIds.length === 0) {
            return cachedProducts
        }

        // Fetch in batches of 10
        const batchSize = 10
        const batches = []
        for (let i = 0; i < uncachedIds.length; i += batchSize) {
            batches.push(uncachedIds.slice(i, i + batchSize))
        }

        try {
            const results = await Promise.all(
                batches.map(async (batch) => {
                    const response = await fetch(`/api/product/batch?ids=${batch.join(',')}`)
                    if (response.ok) {
                        const data = await response.json()
                        return data.products || []
                    }
                    return []
                })
            )
            const fetchedProducts = results.flat()

            // Update cache
            fetchedProducts.forEach(product => {
                if (product) {
                    setProductCache(prev => ({ ...prev, [product._id]: product }))
                }
            })

            return [...cachedProducts, ...fetchedProducts]
        } catch (error) {
            console.error('Failed to fetch batch products:', error)
            return cachedProducts
        }
    }

    const fetchSessions = async () => {
        setSessionsLoading(true)
        try {
            const processed = sessionFilter === 'pending' ? 'false' : sessionFilter === 'processed' ? 'true' : null
            let url = processed !== null ? `/api/admin/sessions?processed=${processed}` : '/api/admin/sessions'

            // Add date range filtering
            const { startDate, endDate } = getDateRange()
            if (startDate && endDate) {
                url += `${url.includes('?') ? '&' : '?'}startDate=${startDate}&endDate=${endDate}`
            }

            const response = await fetch(url)
            if (!response.ok) {
                throw new Error('Failed to fetch sessions')
            }
            const data = await response.json()
            const received = Array.isArray(data.sessions) ? data.sessions : []
            const regular = received.filter(session => session.status !== 'reconciliation_required')
            setPaymentReviews(received.filter(session => session.status === 'reconciliation_required'))
            setSessions(regular)

            // Enrich sessions with product and user data
            const enriched = await enrichSessionsWithData(regular)
            setEnrichedSessions(enriched)
            setFetchedAt(Date.now())
        } catch (error) {
            showToast('Failed to load sessions: ' + error.message, 'error')
        } finally {
            setSessionsLoading(false)
        }
    }

    const getDateRange = () => {
        const now = new Date()
        let startDate, endDate

        switch (dateRange) {
            case 'today':
                startDate = new Date(now.setHours(0, 0, 0, 0)).toISOString()
                endDate = new Date(now.setHours(23, 59, 59, 999)).toISOString()
                break
            case 'week':
                startDate = new Date(now.setDate(now.getDate() - 7)).toISOString()
                endDate = new Date().toISOString()
                break
            case 'month':
                startDate = new Date(now.setMonth(now.getMonth() - 1)).toISOString()
                endDate = new Date().toISOString()
                break
            case '3months':
                startDate = new Date(now.setMonth(now.getMonth() - 3)).toISOString()
                endDate = new Date().toISOString()
                break
            case '6months':
                startDate = new Date(now.setMonth(now.getMonth() - 6)).toISOString()
                endDate = new Date().toISOString()
                break
            case 'year':
                startDate = new Date(now.setFullYear(now.getFullYear() - 1)).toISOString()
                endDate = new Date().toISOString()
                break
            case 'custom':
                if (customStartDate && customEndDate) {
                    startDate = new Date(customStartDate).toISOString()
                    endDate = new Date(customEndDate + 'T23:59:59').toISOString()
                }
                break
            default:
                startDate = null
                endDate = null
        }

        return { startDate, endDate }
    }

    // --- Client-side aggregations over the loaded sessions (§9.10) ---

    // Volume across creators — same sum the legacy summary showed.
    const volumeCents = useMemo(
        () => enrichedSessions.reduce((sum, s) => (
            sum + Object.values(s.salesData).reduce((total, sale) => total + sale.totalAmount, 0)
        ), 0),
        [enrichedSessions]
    )

    const pendingCount = useMemo(
        () => enrichedSessions.filter(s => !s.processed).length,
        [enrichedSessions]
    )

    // Transactions: sessions grouped by day, newest group first.
    const dayGroups = useMemo(() => {
        const map = new Map()
        enrichedSessions.forEach(session => {
            const d = new Date(session.createdAt)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            if (!map.has(key)) {
                map.set(key, {
                    key,
                    label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
                    sessions: [],
                })
            }
            map.get(key).sessions.push(session)
        })
        return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1))
    }, [enrichedSessions])

    // By creator: the payout-run view — one row per creator across the view.
    const creatorRows = useMemo(() => {
        const map = {}
        enrichedSessions.forEach(session => {
            Object.entries(session.salesData).forEach(([creatorId, saleData]) => {
                if (!map[creatorId]) {
                    map[creatorId] = {
                        creatorId,
                        user: null,
                        sessions: 0,
                        items: 0,
                        productRevenue: 0,
                        shippingRevenue: 0,
                        totalAmount: 0,
                    }
                }
                const row = map[creatorId]
                row.user = row.user || session.enrichedData?.[creatorId]?.user || null
                row.sessions += 1
                row.items += saleData.items.length
                row.productRevenue += saleData.productRevenue
                row.shippingRevenue += saleData.shippingRevenue
                row.totalAmount += saleData.totalAmount
            })
        })
        return Object.values(map).sort((a, b) => b.totalAmount - a.totalAmount)
    }, [enrichedSessions])

    // Statements: month rollups with pending/processed split.
    const monthRows = useMemo(() => {
        const map = {}
        enrichedSessions.forEach(session => {
            const d = new Date(session.createdAt)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            if (!map[key]) {
                map[key] = {
                    key,
                    label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
                    sessions: 0,
                    gross: 0,
                    productRevenue: 0,
                    shippingRevenue: 0,
                    pending: 0,
                    processed: 0,
                }
            }
            const row = map[key]
            row.sessions += 1
            Object.values(session.salesData).forEach(sale => {
                row.gross += sale.totalAmount
                row.productRevenue += sale.productRevenue
                row.shippingRevenue += sale.shippingRevenue
            })
            if (session.processed) row.processed += 1
            else row.pending += 1
        })
        return Object.values(map).sort((a, b) => (a.key < b.key ? 1 : -1))
    }, [enrichedSessions])

    const monthTotals = useMemo(() => monthRows.reduce(
        (acc, r) => ({
            sessions: acc.sessions + r.sessions,
            gross: acc.gross + r.gross,
            productRevenue: acc.productRevenue + r.productRevenue,
            shippingRevenue: acc.shippingRevenue + r.shippingRevenue,
            pending: acc.pending + r.pending,
            processed: acc.processed + r.processed,
        }),
        { sessions: 0, gross: 0, productRevenue: 0, shippingRevenue: 0, pending: 0, processed: 0 }
    ), [monthRows])

    // Export respects the active sub-view (§9.10): Transactions keeps the
    // detailed legacy export verbatim; the other views export their rows.
    const exportToExcel = () => {
        if (enrichedSessions.length === 0) {
            showToast('No data to export', 'error')
            return
        }

        const dateRangeText = dateRange === 'all' ? 'All_Time' :
            dateRange === 'custom' ? `${customStartDate}_to_${customEndDate}` :
                dateRange.charAt(0).toUpperCase() + dateRange.slice(1)

        let exportData = []
        let cols = []
        let sheetName = 'Creator Payments'
        let filename = `Creator_Payments_${dateRangeText}_${new Date().toISOString().split('T')[0]}.xlsx`

        if (subView === 'byCreator') {
            exportData = creatorRows.map(row => ({
                'Creator Name': row.user?.name || 'Unknown',
                'Creator Email': row.user?.email || row.creatorId,
                'Stripe Account': row.user?.role === 'admin' ? 'Admin Account' : (row.user?.stripeAccountId || 'No Account'),
                'Sessions': row.sessions,
                'Items': row.items,
                'Product Revenue': `$${(row.productRevenue / 100).toFixed(2)}`,
                'Shipping Revenue': `$${(row.shippingRevenue / 100).toFixed(2)}`,
                'Owed Total': `$${(row.totalAmount / 100).toFixed(2)}`,
            }))
            cols = [{ wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 15 }, { wch: 15 }, { wch: 12 }]
            sheetName = 'By Creator'
            filename = `Creator_Payments_By_Creator_${dateRangeText}_${new Date().toISOString().split('T')[0]}.xlsx`
        } else if (subView === 'statements') {
            exportData = monthRows.map(row => ({
                'Month': row.label,
                'Sessions': row.sessions,
                'Gross Revenue': `$${(row.gross / 100).toFixed(2)}`,
                'Product Revenue': `$${(row.productRevenue / 100).toFixed(2)}`,
                'Shipping Revenue': `$${(row.shippingRevenue / 100).toFixed(2)}`,
                'Pending': row.pending,
                'Processed': row.processed,
            }))
            exportData.push({
                'Month': 'Total',
                'Sessions': monthTotals.sessions,
                'Gross Revenue': `$${(monthTotals.gross / 100).toFixed(2)}`,
                'Product Revenue': `$${(monthTotals.productRevenue / 100).toFixed(2)}`,
                'Shipping Revenue': `$${(monthTotals.shippingRevenue / 100).toFixed(2)}`,
                'Pending': monthTotals.pending,
                'Processed': monthTotals.processed,
            })
            cols = [{ wch: 16 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 10 }]
            sheetName = 'Statements'
            filename = `Creator_Payments_Statements_${dateRangeText}_${new Date().toISOString().split('T')[0]}.xlsx`
        } else {
            // Transactions: the legacy per-creator + per-item detail export, unchanged.
            enrichedSessions.forEach(session => {
                Object.entries(session.salesData).forEach(([creatorId, saleData]) => {
                    const enrichedCreatorData = session.enrichedData[creatorId]

                    // Add creator summary row
                    exportData.push({
                        'Session ID': session.sessionId,
                        'Date': new Date(session.createdAt).toLocaleDateString(),
                        'Status': session.processed ? 'Processed' : 'Pending',
                        'Creator Name': enrichedCreatorData?.user?.name || 'Unknown',
                        'Creator Email': enrichedCreatorData?.user?.email || creatorId,
                        'Creator Phone': enrichedCreatorData?.user?.phone || 'N/A',
                        'Stripe Account': enrichedCreatorData?.user?.stripeAccountId || 'No Account',
                        'Is Admin': enrichedCreatorData?.user?.role === 'admin' ? 'Yes' : 'No',
                        'Total Amount': `$${(saleData.totalAmount / 100).toFixed(2)}`,
                        'Product Revenue': `$${(saleData.productRevenue / 100).toFixed(2)}`,
                        'Shipping Revenue': `$${(saleData.shippingRevenue / 100).toFixed(2)}`,
                        'Currency': session.currency.toUpperCase(),
                        'Buyer Name': session.enrichedData.buyer?.name || 'Unknown',
                        'Buyer Email': session.enrichedData.buyer?.email || 'N/A',
                        'Buyer Phone': session.enrichedData.buyer?.phone || 'N/A',
                        'Items Count': saleData.items.length,
                    })

                    // Add item details
                    enrichedCreatorData?.items?.forEach((item, idx) => {
                        exportData.push({
                            'Session ID': `  └─ Item ${idx + 1}`,
                            'Product Name': item.productName,
                            'Variant': item.variantName,
                            'Quantity': item.quantity,
                            'Unit Price': `$${typeof item.unitPrice === 'number' ? item.unitPrice.toFixed(2) : (item.unitPrice / 100).toFixed(2)}`,
                            'Delivery Type': item.deliveryType,
                        })
                    })
                })
            })
            cols = [
                { wch: 20 }, // Session ID
                { wch: 12 }, // Date
                { wch: 10 }, // Status
                { wch: 20 }, // Creator Name
                { wch: 25 }, // Creator Email
                { wch: 15 }, // Creator Phone
                { wch: 20 }, // Stripe Account
                { wch: 10 }, // Is Admin
                { wch: 12 }, // Total Amount
                { wch: 15 }, // Product Revenue
                { wch: 15 }, // Shipping Revenue
                { wch: 10 }, // Currency
                { wch: 20 }, // Buyer Name
                { wch: 25 }, // Buyer Email
                { wch: 15 }, // Buyer Phone
                { wch: 12 }, // Items Count
            ]
        }

        const ws = XLSX.utils.json_to_sheet(exportData)
        ws['!cols'] = cols
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, sheetName)
        XLSX.writeFile(wb, filename)
        showToast('Export successful!', 'success')
    }

    const copyToClipboard = async (text, message = 'Copied to clipboard') => {
        try {
            await navigator.clipboard.writeText(text)
            showToast(message, 'success')
        } catch (error) {
            console.error('Failed to copy to clipboard:', error)
            showToast('Failed to copy to clipboard', 'error')
        }
    }

    const markSessionAsProcessed = async (sessionId, processed) => {
        if (paymentReviews.some(session => session.sessionId === sessionId)) return
        try {
            const response = await fetch('/api/admin/sessions', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ sessionId, processed }),
            })

            if (!response.ok) {
                throw new Error('Failed to update session')
            }

            showToast(`Session marked as ${processed ? 'processed' : 'pending'}`, 'success')
            fetchSessions() // Refresh the list and re-enrich data
        } catch (error) {
            showToast('Failed to update session: ' + error.message, 'error')
        }
    }

    const peekSession = peekSessionId
        ? enrichedSessions.find((s) => s.sessionId === peekSessionId)
        : null

    // Processed toggle rendered as the row's ONE StatusPill; span[role=button]
    // so it can live inside the clickable ledger row.
    const processedToggle = (session) => (
        <span
            role="button"
            tabIndex={0}
            aria-label={session.processed ? 'Mark as pending' : 'Mark as processed'}
            title={session.processed ? 'Click to mark as pending' : 'Click to mark as processed'}
            onClick={(e) => {
                e.stopPropagation()
                markSessionAsProcessed(session.sessionId, !session.processed)
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    markSessionAsProcessed(session.sessionId, !session.processed)
                }
            }}
            className="cursor-pointer inline-flex"
        >
            <StatusPill tone={session.processed ? 'ink' : 'hatch'}>
                {session.processed ? 'Processed' : 'Pending'}
            </StatusPill>
        </span>
    )

    const transactionColumns = [
        { key: 'session', label: 'Session', width: '1.5fr' },
        { key: 'buyer', label: 'Buyer', width: '1.5fr' },
        { key: 'creators', label: 'Creators', width: '0.6fr' },
        { key: 'total', label: 'Total', align: 'right', width: '0.7fr' },
        { key: 'status', label: 'Status', align: 'right', width: '0.9fr' },
    ]

    // Sales gets a real column of its own so the count never squishes against
    // the split bar; the bar carries its numbers in the hover tooltip.
    const creatorColumns = [
        { key: 'creator', label: 'Creator', width: 'minmax(0,1.5fr)' },
        { key: 'sales', label: 'Sales', align: 'right', width: 'minmax(4rem,0.7fr)' },
        { key: 'split', label: 'Product / shipping', width: 'minmax(0,1.4fr)' },
        { key: 'stripe', label: 'Stripe', width: 'minmax(0,1.1fr)' },
        { key: 'owed', label: 'Owed', align: 'right', width: 'minmax(5rem,0.7fr)' },
    ]

    const stripeChip = (user) => {
        if (user?.role === 'admin') {
            return <StatusPill tone="paper">Admin account</StatusPill>
        }
        if (user?.stripeAccountId) {
            return (
                <span
                    role="button"
                    tabIndex={0}
                    title="Copy Stripe account ID"
                    onClick={(e) => {
                        e.stopPropagation()
                        copyToClipboard(user.stripeAccountId, 'Stripe Account ID copied')
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.stopPropagation()
                            copyToClipboard(user.stripeAccountId, 'Stripe Account ID copied')
                        }
                    }}
                    className="cursor-pointer inline-flex max-w-full"
                >
                    <StatusPill tone="paper" className="max-w-full">
                        <span className="dash-data truncate">{user.stripeAccountId}</span>
                    </StatusPill>
                </span>
            )
        }
        return <StatusPill tone="bad">No Stripe account</StatusPill>
    }

    return (
        <div className="p-4 md:p-6">
            {/* Filters live in the GlassBar as chips/selects (§5.9) */}
            <GlassBar className="flex-wrap">
                <select
                    value={sessionFilter}
                    onChange={(e) => setSessionFilter(e.target.value)}
                    aria-label="Status filter"
                    className={barSelectCls}
                >
                    <option value="all">All sessions</option>
                    <option value="pending">Pending</option>
                    <option value="processed">Processed</option>
                </select>
                <select
                    value={dateRange}
                    onChange={(e) => {
                        setDateRange(e.target.value)
                        setShowDatePicker(e.target.value === 'custom')
                    }}
                    aria-label="Date range"
                    className={barSelectCls}
                >
                    <option value="all">All time</option>
                    <option value="today">Today</option>
                    <option value="week">Past week</option>
                    <option value="month">Past month</option>
                    <option value="3months">Past 3 months</option>
                    <option value="6months">Past 6 months</option>
                    <option value="year">Past year</option>
                    <option value="custom">Custom range</option>
                </select>
                {showDatePicker && (
                    <span className="flex items-center gap-2">
                        <input
                            type="date"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            max={customEndDate || new Date().toISOString().split('T')[0]}
                            aria-label="Start date"
                            className={barDateCls}
                        />
                        <span className="dash-soft text-[13px]" aria-hidden="true">–</span>
                        <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            min={customStartDate}
                            max={new Date().toISOString().split('T')[0]}
                            aria-label="End date"
                            className={barDateCls}
                        />
                    </span>
                )}
                <button
                    type="button"
                    onClick={exportToExcel}
                    disabled={enrichedSessions.length === 0}
                    className={`${quietPillCls} ml-auto flex items-center gap-1.5`}
                >
                    <IoDownloadOutline size={14} aria-hidden="true" /> Export
                </button>
                <FreshnessStamp at={fetchedAt} />
            </GlassBar>

            {paymentReviews.length > 0 && <section aria-label="Payments requiring review" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
                <h2 className="font-semibold">Payments requiring review ({paymentReviews.length})</h2>
                <p className="mt-1 text-sm">Payment was received, but the original order details need reconciliation. These receipts are excluded from payout totals and exports. Review the payment and original records before arranging fulfilment or a refund.</p>
                <div className="mt-3 flex flex-col gap-3">{paymentReviews.map(session => <article key={session.sessionId} className="rounded-lg border border-amber-200 bg-white p-3">
                    <p className="font-semibold">Captured: {String(session.reconciliation?.currency || '').toUpperCase()} {money(session.reconciliation?.amountTotalCents || 0)}</p>
                    <p className="mt-1 break-all text-xs">Session: {session.sessionId}</p>
                    <p className="mt-1 break-all text-xs">Customer: {session.userId}</p>
                    {session.reconciliation?.recordedAt && <p className="mt-1 text-xs">Recorded {new Date(session.reconciliation.recordedAt).toLocaleString()}</p>}
                    {(session.reconciliation?.amountMismatch || session.reconciliation?.currencyMismatch) && <p className="mt-2 text-sm font-medium">The captured amount or currency differs from the original checkout record.</p>}
                    <p className="mt-2 text-sm">Under review. Marking this payment processed is disabled.</p>
                </article>)}</div>
            </section>}

            {/* Summary strip — volume is the view's ink hero (§5.9) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <StatTile label="Sessions" value={enrichedSessions.length} hint="in current filter" />
                <StatTile label="Volume" value={money(volumeCents)} hint="across creators" variant="ink" />
                <StatTile label="Pending" value={pendingCount} hint="to process" />
            </div>

            <ViewTabs
                tabs={SUB_VIEWS.map((v) => ({ key: v.key, label: v.label }))}
                active={subView}
                onChange={setSubView}
                className="mt-4"
            />

            <div className="mt-4">
                {sessionsLoading ? (
                    <div className="flex flex-col gap-3" aria-label="Loading sessions">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <SkeletonRow key={i} />
                        ))}
                    </div>
                ) : enrichedSessions.length === 0 ? (
                    <EmptyState
                        icon={<IoCardOutline />}
                        title="No Sessions Found"
                        body="Nothing matches the selected status and date range."
                        secondary="Clear filters"
                        onSecondary={() => {
                            setSessionFilter('all')
                            setDateRange('all')
                            setShowDatePicker(false)
                        }}
                    />
                ) : subView === 'byCreator' ? (
                    <LedgerTable
                        columns={creatorColumns}
                        groups={[{
                            key: 'creators',
                            rows: creatorRows.map((row) => ({
                                key: row.creatorId,
                                cells: [
                                    <div key="creator" className="min-w-0">
                                        <p className="text-[13px] font-medium truncate">{row.user?.name || 'Unknown Creator'}</p>
                                        <p className="text-[13px] dash-soft truncate">{row.user?.email || row.creatorId}</p>
                                    </div>,
                                    `${row.sessions}`,
                                    <RevenueSplitBar
                                        key="split"
                                        productCents={row.productRevenue}
                                        shippingCents={row.shippingRevenue}
                                    />,
                                    <div key="stripe" className="min-w-0">{stripeChip(row.user)}</div>,
                                    money(row.totalAmount),
                                ],
                            })),
                        }]}
                    />
                ) : subView === 'statements' ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="border-b border-[var(--dash-line)]">
                                    <th className="dash-label text-left px-4 py-2 font-medium">Month</th>
                                    <th className="dash-label text-right px-4 py-2 font-medium">Sessions</th>
                                    <th className="dash-label text-right px-4 py-2 font-medium">Gross</th>
                                    <th className="dash-label text-right px-4 py-2 font-medium">Product</th>
                                    <th className="dash-label text-right px-4 py-2 font-medium">Shipping</th>
                                    <th className="dash-label text-right px-4 py-2 font-medium">Pending</th>
                                    <th className="dash-label text-right px-4 py-2 font-medium">Processed</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--dash-line)]">
                                {monthRows.map((row) => (
                                    <tr key={row.key}>
                                        <td className="px-4 py-2.5 font-medium">{row.label}</td>
                                        <td className="px-4 py-2.5 text-right dash-data">{row.sessions}</td>
                                        <td className="px-4 py-2.5 text-right dash-data">{money(row.gross)}</td>
                                        <td className="px-4 py-2.5 text-right dash-data">{money(row.productRevenue)}</td>
                                        <td className="px-4 py-2.5 text-right dash-data">{money(row.shippingRevenue)}</td>
                                        <td className="px-4 py-2.5 text-right dash-data">{row.pending}</td>
                                        <td className="px-4 py-2.5 text-right dash-data">{row.processed}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t border-[var(--dash-ink)]">
                                    <td className="px-4 py-2.5 font-semibold">Total</td>
                                    <td className="px-4 py-2.5 text-right dash-data font-semibold">{monthTotals.sessions}</td>
                                    <td className="px-4 py-2.5 text-right dash-data font-semibold">{money(monthTotals.gross)}</td>
                                    <td className="px-4 py-2.5 text-right dash-data font-semibold">{money(monthTotals.productRevenue)}</td>
                                    <td className="px-4 py-2.5 text-right dash-data font-semibold">{money(monthTotals.shippingRevenue)}</td>
                                    <td className="px-4 py-2.5 text-right dash-data font-semibold">{monthTotals.pending}</td>
                                    <td className="px-4 py-2.5 text-right dash-data font-semibold">{monthTotals.processed}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                ) : (
                    <LedgerTable
                        columns={transactionColumns}
                        groups={dayGroups.map((group) => ({
                            key: group.key,
                            label: group.label,
                            rows: group.sessions.map((session) => ({
                                key: session.sessionId,
                                onClick: () => setPeekSessionId(session.sessionId),
                                selected: peekSessionId === session.sessionId,
                                cells: [
                                    <span
                                        key="id"
                                        role="button"
                                        tabIndex={0}
                                        title={`${session.sessionId} (click to copy)`}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            copyToClipboard(session.sessionId, 'Session ID copied')
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.stopPropagation()
                                                copyToClipboard(session.sessionId, 'Session ID copied')
                                            }
                                        }}
                                        className="dash-data dash-soft hover:text-[var(--dash-ink)] cursor-pointer truncate block max-w-full"
                                    >
                                        {session.sessionId.substring(0, 18)}…
                                    </span>,
                                    <div key="buyer" className="min-w-0">
                                        <p className="text-[13px] truncate">{session.enrichedData.buyer?.name || 'Unknown'}</p>
                                        <p className="text-[13px] dash-soft truncate">{session.enrichedData.buyer?.email || ''}</p>
                                    </div>,
                                    `${Object.keys(session.salesData).length}`,
                                    money(session.totalAmount),
                                    <span key="status" className="inline-flex justify-end w-full">{processedToggle(session)}</span>,
                                ],
                            })),
                        }))}
                    />
                )}
            </div>

            <PeekPanel
                open={Boolean(peekSession)}
                onClose={() => setPeekSessionId(null)}
                title={peekSession ? `Session ${peekSession.sessionId.substring(0, 14)}…` : ''}
                widthClass="max-w-[520px]"
                actions={peekSession && (
                    <>
                        {/* Honest stub (openspec add-refunds-ui): no refund endpoint yet. */}
                        <button
                            type="button"
                            disabled
                            title="Refunds, coming soon"
                            className="dash-hoverable rounded-full px-3.5 py-1.5 text-[13px] font-medium border border-[var(--dash-line)] bg-[var(--dash-card)] text-[var(--dash-bad)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Refund…
                        </button>
                        <button
                            type="button"
                            onClick={() => markSessionAsProcessed(peekSession.sessionId, !peekSession.processed)}
                            className={quietPillCls}
                        >
                            {peekSession.processed ? 'Mark as pending' : 'Mark as processed'}
                        </button>
                    </>
                )}
            >
                {peekSession && (
                    <div className="flex flex-col gap-6">
                        <div className="flex items-center justify-between gap-3">
                            <StatusPill tone={peekSession.processed ? 'ink' : 'hatch'}>
                                {peekSession.processed ? 'Processed' : 'Pending'}
                            </StatusPill>
                            <span className="dash-data">
                                {money(peekSession.totalAmount)} {peekSession.currency.toUpperCase()}
                            </span>
                        </div>

                        {/* Buyer block */}
                        <section>
                            <h4 className="dash-label mb-1">Buyer</h4>
                            {peekSession.enrichedData.buyer ? (
                                <>
                                    <DottedRow label="Name">{peekSession.enrichedData.buyer.name}</DottedRow>
                                    <DottedRow label="Email">{peekSession.enrichedData.buyer.email}</DottedRow>
                                    {peekSession.enrichedData.buyer.phone && peekSession.enrichedData.buyer.phone !== 'No phone' && (
                                        <DottedRow label="Phone">{peekSession.enrichedData.buyer.phone}</DottedRow>
                                    )}
                                    {peekSession.enrichedData.buyer.address && peekSession.enrichedData.buyer.address !== 'No address' && (
                                        <p className="text-[13px] dash-soft mt-1">{peekSession.enrichedData.buyer.address}</p>
                                    )}
                                </>
                            ) : (
                                <p className="text-[13px] dash-soft">Buyer details unavailable.</p>
                            )}
                        </section>

                        {/* Per-creator breakdown */}
                        <section>
                            <h4 className="dash-label mb-2">Creator sales</h4>
                            <div className="flex flex-col gap-3">
                                {Object.entries(peekSession.salesData).map(([creatorId, saleData]) => {
                                    const enrichedCreatorData = peekSession.enrichedData[creatorId]
                                    return (
                                        <div
                                            key={creatorId}
                                            className="border border-[var(--dash-line)] rounded-[var(--dash-r-inner)] p-3"
                                        >
                                            <div className="flex items-start justify-between gap-3 mb-1">
                                                <div className="min-w-0">
                                                    <p className="text-[13px] font-medium truncate">
                                                        {enrichedCreatorData?.user?.name || 'Unknown Creator'}
                                                    </p>
                                                    <p className="text-[13px] dash-soft truncate">
                                                        {enrichedCreatorData?.user?.email || `${creatorId.substring(0, 20)}…`}
                                                    </p>
                                                </div>
                                                <span className="dash-data font-medium shrink-0">
                                                    {money(saleData.totalAmount)}
                                                </span>
                                            </div>
                                            <div className="mb-2">{stripeChip(enrichedCreatorData?.user)}</div>
                                            {enrichedCreatorData?.user?.phone && enrichedCreatorData.user.phone !== 'No phone' && (
                                                <DottedRow label="Phone">{enrichedCreatorData.user.phone}</DottedRow>
                                            )}
                                            <DottedRow label="Product revenue">{money(saleData.productRevenue)}</DottedRow>
                                            <DottedRow label="Shipping revenue">{money(saleData.shippingRevenue)}</DottedRow>
                                            <DottedRow label="Items">{saleData.items.length}</DottedRow>
                                            <div className="mt-2 flex flex-col gap-1.5">
                                                {(enrichedCreatorData?.items?.length ? enrichedCreatorData.items : saleData.items).map((item, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="bg-[var(--dash-canvas)] border border-[var(--dash-line)] rounded-[var(--dash-r-inner)] px-2.5 py-1.5"
                                                    >
                                                        <div className="flex justify-between gap-2 text-[13px]">
                                                            <span className="font-medium truncate">
                                                                {item.productName || 'Loading product data…'}
                                                            </span>
                                                            <span className="dash-data shrink-0">×{item.quantity}</span>
                                                        </div>
                                                        <div className="flex justify-between gap-2 text-[13px] dash-soft">
                                                            <span className="truncate">
                                                                {item.variantName ? `${item.variantName}, ` : ''}{item.deliveryType}
                                                            </span>
                                                            <span className="dash-data shrink-0">{unitPriceLabel(item.unitPrice)}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </section>

                        {/* Digital deliveries */}
                        <section>
                            <h4 className="dash-label mb-1">Digital products</h4>
                            {Object.keys(peekSession.digitalProductData || {}).length > 0 ? (
                                <div className="flex flex-col">
                                    {Object.entries(peekSession.digitalProductData).map(([productId, digitalData]) => (
                                        <div key={productId} className="py-1">
                                            <DottedRow label={`${productId.substring(0, 12)}…`}>
                                                {digitalData.links.length} link{digitalData.links.length !== 1 ? 's' : ''}
                                            </DottedRow>
                                            <p className="text-[13px] dash-soft">
                                                Buyer: {digitalData.buyer.substring(0, 20)}…
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[13px] dash-soft">No digital products in this session.</p>
                            )}
                        </section>
                    </div>
                )}
            </PeekPanel>
        </div>
    )
}
