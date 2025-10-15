import { useState, useEffect } from 'react'

export function useOrderStatuses(orderType = null) {
    const [orderStatuses, setOrderStatuses] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        const fetchOrderStatuses = async () => {
            try {
                setLoading(true)
                const url = orderType
                    ? `/api/admin/order-statuses?orderType=${orderType}`
                    : '/api/admin/order-statuses'

                const response = await fetch(url)
                const data = await response.json()

                if (response.ok) {
                    setOrderStatuses(data.orderStatuses || [])
                    setError(null)
                } else {
                    setError(data.error || 'Failed to fetch order statuses')
                }
            } catch (err) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }

        fetchOrderStatuses()
    }, [orderType])

    return { orderStatuses, loading, error }
}

// Utility function to get display name for a status
export function getStatusDisplayName(statusKey, orderStatuses) {
    const status = orderStatuses.find(s => s.statusKey === statusKey)
    return status?.displayName || statusKey.charAt(0).toUpperCase() + statusKey.slice(1)
}

// Utility function to get status color
export function getStatusColor(statusKey, orderStatuses) {
    const status = orderStatuses.find(s => s.statusKey === statusKey)
    return status?.color || '#6b7280'
}