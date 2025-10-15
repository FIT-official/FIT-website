'use client'
import { useState, useEffect } from 'react'
import { useToast } from '@/components/General/ToastProvider'
import { FaRegCopy } from 'react-icons/fa'

export default function CreatorPayments() {
    const { showToast } = useToast()
    const [sessions, setSessions] = useState([])
    const [sessionsLoading, setSessionsLoading] = useState(false)
    const [sessionFilter, setSessionFilter] = useState('pending')
    const [enrichedSessions, setEnrichedSessions] = useState([])
    const [productCache, setProductCache] = useState({})
    const [userCache, setUserCache] = useState({})

    useEffect(() => {
        fetchSessions()
    }, [sessionFilter])

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
        const enrichedSessionsData = []

        for (const session of sessions) {
            const enrichedSession = { ...session, enrichedData: {} }

            // Fetch user data for buyer and creators
            const buyerData = await fetchUserData(session.userId)
            enrichedSession.enrichedData.buyer = buyerData

            // Fetch creator data and product data
            for (const [creatorId, saleData] of Object.entries(session.salesData)) {
                const creatorData = await fetchUserData(creatorId)
                enrichedSession.enrichedData[creatorId] = { user: creatorData, items: [] }

                // Fetch product data for each item
                for (const item of saleData.items) {
                    const productData = await fetchProductData(item.productId)
                    const variant = productData?.variants?.find(v => v._id === item.variantId)

                    enrichedSession.enrichedData[creatorId].items.push({
                        ...item,
                        productName: productData?.name || 'Unknown Product',
                        variantName: variant?.name || 'Unknown Variant'
                    })
                }
            }

            enrichedSessionsData.push(enrichedSession)
        }

        return enrichedSessionsData
    }

    const fetchSessions = async () => {
        setSessionsLoading(true)
        try {
            const processed = sessionFilter === 'pending' ? 'false' : sessionFilter === 'processed' ? 'true' : null
            const url = processed !== null ? `/api/admin/sessions?processed=${processed}` : '/api/admin/sessions'
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

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text)
            showToast('Account ID copied', 'success')
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
        <div className="space-y-6">
            {/* Filter Controls */}
            <div className="bg-white border border-borderColor rounded-lg p-4">
                <div className="flex items-center space-x-4">
                    <label className="text-sm font-medium text-gray-700">Filter by status:</label>
                    <select
                        value={sessionFilter}
                        onChange={(e) => setSessionFilter(e.target.value)}
                        className="px-3 py-1 border border-borderColor rounded-md text-sm ring-none outline-none"
                    >
                        <option value="pending">Pending Only</option>
                        <option value="processed">Processed Only</option>
                        <option value="all">All Sessions</option>
                    </select>
                    <button
                        onClick={fetchSessions}
                        className="formButton text-xs"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {sessionsLoading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="loader" />
                </div>
            ) : enrichedSessions.length > 0 ? (
                <div className="space-y-4">
                    {enrichedSessions.map((session) => (
                        <div key={session.sessionId} className="bg-white border border-borderColor rounded-lg p-6">
                            {/* Session Header */}
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                                        Session: {session.sessionId.substring(0, 25)}...
                                    </h3>
                                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                                        <span>Total: ${(session.totalAmount / 100).toFixed(2)} {session.currency.toUpperCase()}</span>
                                        <span>Date: {new Date(session.createdAt).toLocaleDateString()}</span>
                                    </div>
                                    {session.enrichedData.buyer && (
                                        <div className="mt-2 text-sm text-gray-600">
                                            <strong>Buyer:</strong> {session.enrichedData.buyer.name} ({session.enrichedData.buyer.email})
                                            {session.enrichedData.buyer.phone !== 'No phone' && (
                                                <span> • {session.enrichedData.buyer.phone}</span>
                                            )}
                                            {session.enrichedData.buyer.address !== 'No address' && (
                                                <div className="text-xs text-gray-500 mt-1">
                                                    Address: {session.enrichedData.buyer.address}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center space-x-2">
                                    <span className={`inline-flex px-4 py-2 text-xs font-medium rounded-full border ${session.processed
                                        ? 'bg-green-100 border border-green-800/50 text-green-800'
                                        : 'bg-red-100 border-red-800/50 text-red-800'
                                        }`}>
                                        {session.processed ? 'Processed' : 'Pending'}
                                    </span>
                                    {!session.processed ? (
                                        <button
                                            onClick={() => markSessionAsProcessed(session.sessionId, true)}
                                            className="formBlackButton"
                                        >
                                            Mark as Processed
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => markSessionAsProcessed(session.sessionId, false)}
                                            className="formBlackButton"
                                        >
                                            Mark as Pending
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Sales Data Breakdown */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Creator Sales */}
                                <div>
                                    <h4 className="font-medium text-gray-900 mb-3">Creator Sales</h4>
                                    <div className="space-y-3">
                                        {Object.entries(session.salesData).map(([creatorId, saleData]) => {
                                            const enrichedCreatorData = session.enrichedData[creatorId]
                                            return (
                                                <div key={creatorId} className="bg-gray-50 p-3 rounded-md">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="text-sm">
                                                            <div className="font-medium text-gray-800">
                                                                {enrichedCreatorData?.user?.name || 'Unknown Creator'}
                                                            </div>
                                                            <div className="text-xs text-gray-600">
                                                                {enrichedCreatorData?.user?.email || creatorId.substring(0, 20) + '...'}
                                                            </div>
                                                            {enrichedCreatorData?.user?.phone !== 'No phone' && (
                                                                <div className="text-xs text-gray-600">
                                                                    {enrichedCreatorData.user.phone}
                                                                </div>
                                                            )}
                                                            {enrichedCreatorData?.user?.role === 'admin' ? (
                                                                <div className="text-xs text-blue-600 mt-1 font-medium">
                                                                    This user is an admin
                                                                </div>
                                                            ) : enrichedCreatorData?.user?.stripeAccountId ? (
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className="text-xs text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded">
                                                                        {enrichedCreatorData.user.stripeAccountId}
                                                                    </span>
                                                                    <button
                                                                        onClick={() => copyToClipboard(enrichedCreatorData.user.stripeAccountId)}
                                                                        className="text-gray-500 hover:text-gray-700 transition-colors"
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
                                                        <span className="text-sm font-semibold text-green-600">
                                                            ${(saleData.totalAmount / 100).toFixed(2)}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-gray-600 space-y-1 mb-2">
                                                        <div>Product Revenue: ${(saleData.productRevenue / 100).toFixed(2)}</div>
                                                        <div>Shipping Revenue: ${(saleData.shippingRevenue / 100).toFixed(2)}</div>
                                                        <div>Items: {saleData.items.length}</div>
                                                    </div>

                                                    {/* Item Details */}
                                                    <div className="mt-2 space-y-1">
                                                        {enrichedCreatorData?.items?.map((item, idx) => (
                                                            <div key={idx} className="text-xs text-gray-500 bg-white p-2 rounded">
                                                                <div className="flex justify-between mb-1">
                                                                    <span className="font-medium">{item.productName}</span>
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
                                                            <div key={idx} className="text-xs text-gray-500 bg-white p-2 rounded">
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
                                    <h4 className="font-medium text-gray-900 mb-3">Digital Products</h4>
                                    {Object.keys(session.digitalProductData).length > 0 ? (
                                        <div className="space-y-3">
                                            {Object.entries(session.digitalProductData).map(([productId, digitalData]) => (
                                                <div key={productId} className="bg-blue-50 p-3 rounded-md">
                                                    <div className="text-sm">
                                                        <div className="font-medium text-gray-800 mb-1">
                                                            Product: {productId.substring(0, 12)}...
                                                        </div>
                                                        <div className="text-xs text-gray-600">
                                                            Buyer: {digitalData.buyer.substring(0, 20)}...
                                                        </div>
                                                        <div className="text-xs text-gray-600">
                                                            Download Links: {digitalData.links.length} available
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded-md">
                                            No digital products in this session
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 bg-white border border-borderColor rounded-lg">
                    <p className="text-gray-600">No sessions found for the selected filter.</p>
                    <button
                        onClick={fetchSessions}
                        className="mt-4 formButton text-xs"
                    >
                        Refresh
                    </button>
                </div>
            )}
        </div>
    )
}