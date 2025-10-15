'use client'
import { useState, useEffect } from 'react'
import { useToast } from '@/components/General/ToastProvider'

export default function OrderStatusManagement() {
    const [orderStatuses, setOrderStatuses] = useState([])
    const [loading, setLoading] = useState(false)
    const { showToast } = useToast()

    // Form state
    const [form, setForm] = useState({
        statusKey: '',
        displayName: '',
        description: '',
        orderType: 'order',
        color: '#6b7280',
        order: 0,
        isActive: true
    })

    const [editingItem, setEditingItem] = useState(null)

    useEffect(() => {
        fetchOrderStatuses()
    }, [])

    const fetchOrderStatuses = async () => {
        try {
            const response = await fetch('/api/admin/settings')
            const data = await response.json()
            if (response.ok) {
                setOrderStatuses(data.orderStatuses || [])
            } else {
                showToast(data.error || 'Failed to fetch order statuses', 'error')
            }
        } catch (error) {
            showToast('Error fetching order statuses: ' + error.message, 'error')
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)

        try {
            const method = editingItem ? 'PUT' : 'POST'
            const payload = editingItem
                ? { type: 'order-status', id: editingItem._id, data: form }
                : { type: 'order-status', data: form }

            const response = await fetch('/api/admin/settings', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            const data = await response.json()
            if (response.ok) {
                showToast(
                    editingItem ? 'Order status updated successfully' : 'Order status created successfully',
                    'success'
                )
                resetForm()
                fetchOrderStatuses()
            } else {
                showToast(data.error || 'Operation failed', 'error')
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error')
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this order status? This action cannot be undone.')) return

        try {
            const response = await fetch(`/api/admin/settings?type=order-status&id=${id}`, {
                method: 'DELETE'
            })
            const data = await response.json()
            if (response.ok) {
                showToast('Order status deleted successfully', 'success')
                fetchOrderStatuses()
            } else {
                showToast(data.error || 'Failed to delete order status', 'error')
            }
        } catch (error) {
            showToast('Error deleting order status: ' + error.message, 'error')
        }
    }

    const startEdit = (item) => {
        setForm({
            statusKey: item.statusKey,
            displayName: item.displayName,
            description: item.description,
            orderType: item.orderType,
            color: item.color,
            order: item.order,
            isActive: item.isActive
        })
        setEditingItem(item)
    }

    const cancelEdit = () => {
        resetForm()
        setEditingItem(null)
    }

    const resetForm = () => {
        setForm({
            statusKey: '',
            displayName: '',
            description: '',
            orderType: 'order',
            color: '#6b7280',
            order: 0,
            isActive: true
        })
    }

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-lg border border-borderColor p-6">
                <h2 className="text-xl font-semibold mb-4">Order Status Management</h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Form */}
                    <div>
                        <h3 className="text-lg font-medium mb-4">
                            {editingItem ? 'Edit Order Status' : 'Add New Order Status'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Status Key *</label>
                                <input
                                    type="text"
                                    value={form.statusKey}
                                    onChange={(e) => setForm(prev => ({ ...prev, statusKey: e.target.value }))}
                                    className="formInput"
                                    placeholder="e.g., pending_config, processing"
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1">Internal key, should be unique and snake_case</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Display Name *</label>
                                <input
                                    type="text"
                                    value={form.displayName}
                                    onChange={(e) => setForm(prev => ({ ...prev, displayName: e.target.value }))}
                                    className="formInput"
                                    placeholder="e.g., Pending Configuration, Processing"
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1">User-friendly name shown in UI</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Description</label>
                                <textarea
                                    value={form.description}
                                    onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                                    className="formInput"
                                    rows="3"
                                    placeholder="Brief description of this status"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Order Type *</label>
                                <select
                                    value={form.orderType}
                                    onChange={(e) => setForm(prev => ({ ...prev, orderType: e.target.value }))}
                                    className="formInput"
                                    required
                                >
                                    <option value="order">Regular Order</option>
                                    <option value="printOrder">Print Order</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Color</label>
                                <div className="flex space-x-2">
                                    <input
                                        type="color"
                                        value={form.color}
                                        onChange={(e) => setForm(prev => ({ ...prev, color: e.target.value }))}
                                        className="w-12 h-10 border border-borderColor rounded"
                                    />
                                    <input
                                        type="text"
                                        value={form.color}
                                        onChange={(e) => setForm(prev => ({ ...prev, color: e.target.value }))}
                                        className="formInput flex-1"
                                        placeholder="#6b7280"
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mt-1">Hex color for UI display</p>
                            </div>



                            <div>
                                <label className="block text-sm font-medium mb-1">Order</label>
                                <input
                                    type="number"
                                    value={form.order}
                                    onChange={(e) => setForm(prev => ({ ...prev, order: parseInt(e.target.value) }))}
                                    className="formInput"
                                    min="0"
                                />
                                <p className="text-xs text-gray-500 mt-1">Display order in status lists</p>
                            </div>

                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="isActive"
                                    checked={form.isActive}
                                    onChange={(e) => setForm(prev => ({ ...prev, isActive: e.target.checked }))}
                                    className="mr-2"
                                />
                                <label htmlFor="isActive" className="text-sm font-medium">Active</label>
                            </div>

                            <div className="flex space-x-2">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="formBlackButton"
                                >
                                    {loading ? 'Saving...' : (editingItem ? 'Update' : 'Create')}
                                </button>
                                {editingItem && (
                                    <button
                                        type="button"
                                        onClick={cancelEdit}
                                        className="formButton"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>

                    {/* List */}
                    <div>
                        <h3 className="text-lg font-medium mb-4">Existing Order Statuses</h3>
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                            {orderStatuses.map((item, index) => (
                                <div key={item._id || `hardcoded-${item.statusKey}-${item.orderType}-${index}`} className="p-4 border border-borderColor rounded">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center space-x-2">
                                                <div
                                                    className="w-4 h-4 rounded"
                                                    style={{ backgroundColor: item.color }}
                                                ></div>
                                                <div className="font-medium">{item.displayName}</div>
                                            </div>
                                            <div className="text-sm text-gray-600 mt-1">
                                                Key: {item.statusKey} • Type: {item.orderType}
                                            </div>
                                            <div className="text-sm text-gray-600">
                                                Order: {item.order} • {item.isActive ? 'Active' : 'Inactive'}
                                            </div>
                                            {item.description && (
                                                <div className="text-sm text-gray-500 mt-1 italic">
                                                    {item.description}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex space-x-2 ml-4">
                                            {item.isHardcoded ? (
                                                <span className="text-sm px-3 py-1 bg-gray-100 text-gray-500 rounded">
                                                    Built-in
                                                </span>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => startEdit(item)}
                                                        className="text-sm px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(item._id)}
                                                        className="text-sm px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                                                    >
                                                        Delete
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}