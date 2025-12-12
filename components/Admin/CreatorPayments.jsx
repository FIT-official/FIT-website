'use client'
import { useState, useEffect } from 'react'
import { useToast } from '@/components/General/ToastProvider'
import { FaRegCopy, FaDownload } from 'react-icons/fa'
import * as XLSX from 'xlsx'

export default function CreatorPayments() {
    const { showToast } = useToast()
    const [sessions, setSessions] = useState([])
    const [sessionsLoading, setSessionsLoading] = useState(false)
    const [sessionFilter, setSessionFilter] = useState('pending')
    const [enrichedSessions, setEnrichedSessions] = useState([])
    const [productCache, setProductCache] = useState({})
    const [userCache, setUserCache] = useState({})

    // Date range states
    const [dateRange, setDateRange] = useState('all')
    const [customStartDate, setCustomStartDate] = useState('')
    const [customEndDate, setCustomEndDate] = useState('')
    const [showDatePicker, setShowDatePicker] = useState(false)

    useEffect(() => {
        fetchSessions()
    }, [sessionFilter, dateRange, customStartDate, customEndDate])

    const fetchProductData = async (productId) => {
        if (productCache[productId]) {
            return productCache[productId]
        }

        try {
            const response = await fetch(`/api/product/${productId}`)
            if (response.ok) {
                const product = await response.json()
                setProductCache(prev => ({ ...prev, [productId]: product }))
                return product
            }
        } catch (error) {
            console.error('Failed to fetch product:', error)
        }
        return null
    }

    const fetchUserData = async (userId) => {
        if (userCache[userId]) {
            return userCache[userId]
        }

        try {
            const response = await fetch(`/api/user/${userId}`)
            if (response.ok) {
                const user = await response.json()
                setUserCache(prev => ({ ...prev, [userId]: user }))
                return user
            }
        } catch (error) {
            console.error('Failed to fetch user:', error)
        }
        return null
    }

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
            setSessions(data.sessions)

            // Enrich sessions with product and user data
            const enriched = await enrichSessionsWithData(data.sessions)
            setEnrichedSessions(enriched)
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

    const exportToExcel = () => {
        if (enrichedSessions.length === 0) {
            showToast('No data to export', 'error')
            return
        }

        // Prepare data for export
        const exportData = []

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

        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(exportData)

        // Set column widths
        ws['!cols'] = [
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

        // Create workbook
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Creator Payments')

        // Generate filename with date range
        const dateRangeText = dateRange === 'all' ? 'All_Time' :
            dateRange === 'custom' ? `${customStartDate}_to_${customEndDate}` :
                dateRange.charAt(0).toUpperCase() + dateRange.slice(1)
        const filename = `Creator_Payments_${dateRangeText}_${new Date().toISOString().split('T')[0]}.xlsx`

        // Save file
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

    return (
        <div className="flex flex-col gap-6 p-6 md:p-12 bg-borderColor/30 min-h-screen">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h2 className="text-xl sm:text-2xl font-semibold text-textColor">Creator Payments</h2>
                    <p className="text-xs sm:text-sm text-lightColor mt-1">Manage and track creator revenue from digital product sales</p>
                </div>
                <button
                    onClick={exportToExcel}
                    disabled={enrichedSessions.length === 0}
                    className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                >
                    <FaDownload />
                    Export to Excel
                </button>
            </div>

            {/* Filter Controls */}
            <div className="bg-white border border-borderColor rounded-xl p-4 sm:p-6 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {/* Status Filter */}
                    <div>
                        <label className="block text-sm font-medium text-textColor mb-2">Status</label>
                        <select
                            value={sessionFilter}
                            onChange={(e) => setSessionFilter(e.target.value)}
                            className="formInput"
                        >
                            <option value="all">All Sessions</option>
                            <option value="pending">Pending</option>
                            <option value="processed">Processed</option>
                        </select>
                    </div>

                    {/* Date Range Filter */}
                    <div>
                        <label className="block text-sm font-medium text-textColor mb-2">Date Range</label>
                        <select
                            value={dateRange}
                            onChange={(e) => {
                                setDateRange(e.target.value)
                                if (e.target.value === 'custom') {
                                    setShowDatePicker(true)
                                } else {
                                    setShowDatePicker(false)
                                }
                            }}
                            className="formInput"
                        >
                            <option value="all">All Time</option>
                            <option value="today">Today</option>
                            <option value="week">Past Week</option>
                            <option value="month">Past Month</option>
                            <option value="3months">Past 3 Months</option>
                            <option value="6months">Past 6 Months</option>
                            <option value="year">Past Year</option>
                            <option value="custom">Custom Range</option>
                        </select>
                    </div>

                    {/* Stats Summary */}
                    <div className="flex flex-col justify-center">
                        <div className="text-sm text-lightColor mb-1">Summary</div>
                        <div className="flex items-center gap-4 text-sm">
                            <span className="text-textColor font-medium">{enrichedSessions.length} sessions</span>
                            <span className="text-lightColor">•</span>
                            <span className="text-textColor font-medium">
                                ${(enrichedSessions.reduce((sum, s) => {
                                    return sum + Object.values(s.salesData).reduce((total, sale) => total + sale.totalAmount, 0)
                                }, 0) / 100).toFixed(2)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Custom Date Range Picker */}
                {showDatePicker && (
                    <div className="mt-4 pt-4 border-t border-borderColor">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-textColor mb-2">Start Date</label>
                                <input
                                    type="date"
                                    value={customStartDate}
                                    onChange={(e) => setCustomStartDate(e.target.value)}
                                    max={customEndDate || new Date().toISOString().split('T')[0]}
                                    className="formInput"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-textColor mb-2">End Date</label>
                                <input
                                    type="date"
                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                    min={customStartDate}
                                    max={new Date().toISOString().split('T')[0]}
                                    className="formInput"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>            {sessionsLoading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="loader" />
                </div>
            ) : enrichedSessions.length > 0 ? (
                <div className="space-y-4">
                    {enrichedSessions.map((session) => (
                        <div key={session.sessionId} className="adminDashboardContainer">
                            <div className="px-4 sm:px-6 py-4 border-b border-borderColor bg-baseColor">
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                <h3 className="text-xs sm:text-sm font-mono text-textColor truncate" title={session.sessionId}>
                                                    {session.sessionId.substring(0, 20)}...
                                                </h3>
                                                <button
                                                    onClick={() => copyToClipboard(session.sessionId, 'Session ID copied')}
                                                    className="text-lightColor hover:text-textColor transition-colors shrink-0"
                                                    title="Copy Session ID"
                                                >
                                                    <FaRegCopy size={14} />
                                                </button>
                                            </div>
                                            <span className={`inline-flex px-2 sm:px-3 py-1 text-xs font-medium rounded-full border shrink-0 ${session.processed
                                                ? 'bg-green-100 border-green-800/50 text-green-800'
                                                : 'bg-red-100 border-red-800/50 text-red-800'
                                                }`}>
                                                {session.processed ? 'Processed' : 'Pending'}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm text-lightColor">
                                            <span className="font-medium text-textColor">
                                                ${(session.totalAmount / 100).toFixed(2)} {session.currency.toUpperCase()}
                                            </span>
                                            <span className="hidden sm:inline">•</span>
                                            <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                                            <span className="hidden sm:inline">•</span>
                                            <span>{Object.keys(session.salesData).length} creator(s)</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => markSessionAsProcessed(session.sessionId, !session.processed)}
                                        className="formBlackButton text-xs w-full sm:w-auto shrink-0"
                                    >
                                        Mark as {session.processed ? 'Pending' : 'Processed'}
                                    </button>
                                </div>

                                {/* Buyer Information */}
                                {session.enrichedData.buyer && (
                                    <div className="mt-3 pt-3 border-t border-borderColor text-sm text-lightColor">
                                        <strong className="text-textColor">Buyer:</strong> {session.enrichedData.buyer.name} ({session.enrichedData.buyer.email})
                                        {session.enrichedData.buyer.phone !== 'No phone' && (
                                            <span> • {session.enrichedData.buyer.phone}</span>
                                        )}
                                        {session.enrichedData.buyer.address !== 'No address' && (
                                            <div className="text-xs mt-1">
                                                {session.enrichedData.buyer.address}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Sales Data Breakdown */}
                            <div className="p-4 sm:p-6">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                                    {/* Creator Sales */}
                                    <div>
                                        <h4 className="text-sm font-semibold text-textColor uppercase tracking-wide mb-3">Creator Sales</h4>
                                        <div className="space-y-3">
                                            {Object.entries(session.salesData).map(([creatorId, saleData]) => {
                                                const enrichedCreatorData = session.enrichedData[creatorId]
                                                return (
                                                    <div key={creatorId} className="bg-baseColor border border-borderColor p-3 rounded-lg">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="text-sm">
                                                                <div className="font-medium text-textColor">
                                                                    {enrichedCreatorData?.user?.name || 'Unknown Creator'}
                                                                </div>
                                                                <div className="text-xs text-lightColor">
                                                                    {enrichedCreatorData?.user?.email || creatorId.substring(0, 20) + '...'}
                                                                </div>
                                                                {enrichedCreatorData?.user?.phone && enrichedCreatorData.user.phone !== 'No phone' && (
                                                                    <div className="text-xs text-lightColor">
                                                                        {enrichedCreatorData.user.phone}
                                                                    </div>
                                                                )}
                                                                {enrichedCreatorData?.user?.role === 'admin' ? (
                                                                    <div className="text-xs text-textColor mt-1 font-medium">
                                                                        This user is an admin
                                                                    </div>
                                                                ) : enrichedCreatorData?.user?.stripeAccountId ? (
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <span className="text-xs text-lightColor font-mono bg-white px-2 py-1 rounded border border-borderColor">
                                                                            {enrichedCreatorData.user.stripeAccountId}
                                                                        </span>
                                                                        <button
                                                                            onClick={() => copyToClipboard(enrichedCreatorData.user.stripeAccountId, 'Stripe Account ID copied')}
                                                                            className="text-lightColor hover:text-textColor transition-colors"
                                                                            title="Copy Account ID"
                                                                        >
                                                                            <FaRegCopy />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-xs text-red-600 mt-1">
                                                                        No Stripe Account
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <span className="text-sm font-semibold text-textColor">
                                                                ${(saleData.totalAmount / 100).toFixed(2)}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-lightColor space-y-1 mb-2">
                                                            <div>Product Revenue: ${(saleData.productRevenue / 100).toFixed(2)}</div>
                                                            <div>Shipping Revenue: ${(saleData.shippingRevenue / 100).toFixed(2)}</div>
                                                            <div>Items: {saleData.items.length}</div>
                                                        </div>

                                                        {/* Item Details */}
                                                        <div className="mt-2 space-y-1">
                                                            {enrichedCreatorData?.items?.map((item, idx) => (
                                                                <div key={idx} className="text-xs text-lightColor bg-white border border-borderColor p-2 rounded">
                                                                    <div className="flex justify-between mb-1">
                                                                        <span className="font-medium text-textColor">{item.productName}</span>
                                                                        <span>Qty: {item.quantity}</span>
                                                                    </div>
                                                                    <div className="flex justify-between mb-1">
                                                                        <span>Variant: {item.variantName}</span>
                                                                        <span>Delivery: {item.deliveryType}</span>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        Unit Price: ${typeof item.unitPrice === 'number' ? item.unitPrice.toFixed(2) : (item.unitPrice / 100).toFixed(2)}
                                                                    </div>
                                                                </div>
                                                            )) || saleData.items.map((item, idx) => (
                                                                <div key={idx} className="text-xs text-lightColor bg-white border border-borderColor p-2 rounded">
                                                                    <div className="flex justify-between">
                                                                        <span>Loading product data...</span>
                                                                        <span>Qty: {item.quantity}</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* Digital Products */}
                                    <div>
                                        <h4 className="text-sm font-semibold text-textColor uppercase tracking-wide mb-3">Digital Products</h4>
                                        {Object.keys(session.digitalProductData).length > 0 ? (
                                            <div className="space-y-3">
                                                {Object.entries(session.digitalProductData).map(([productId, digitalData]) => (
                                                    <div key={productId} className="bg-baseColor border border-borderColor p-3 rounded-lg">
                                                        <div className="text-sm">
                                                            <div className="font-medium text-textColor mb-1">
                                                                Product: {productId.substring(0, 12)}...
                                                            </div>
                                                            <div className="text-xs text-lightColor">
                                                                Buyer: {digitalData.buyer.substring(0, 20)}...
                                                            </div>
                                                            <div className="text-xs text-lightColor">
                                                                Download Links: {digitalData.links.length} available
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-sm text-lightColor bg-baseColor border border-borderColor p-3 rounded-lg">
                                                No digital products in this session
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 bg-white border border-borderColor rounded-xl">
                    <p className="text-lightColor">No sessions found for the selected filter.</p>
                </div>
            )}
        </div>
    )
}