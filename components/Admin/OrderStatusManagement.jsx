'use client'
import { useState, useEffect } from 'react'
import { useToast } from '@/components/General/ToastProvider'
import { MdExpandMore, MdExpandLess, MdCheckCircle, MdOutlineLightbulb, MdAdd } from 'react-icons/md'
import { TbTruckDelivery, TbPackage, TbBox, TbChecks, TbX, TbClock } from 'react-icons/tb'
import { FiPackage, FiTruck, FiCheck } from 'react-icons/fi'
import { BiPackage } from 'react-icons/bi'
import { HiSparkles } from 'react-icons/hi'
import { IoMdCheckmarkCircleOutline, IoMdPrint } from 'react-icons/io'
import { RxCross1 } from 'react-icons/rx'

// Available icons for order statuses
const AVAILABLE_ICONS = [
    { name: 'TbTruckDelivery', component: TbTruckDelivery, label: 'Truck Delivery' },
    { name: 'TbPackage', component: TbPackage, label: 'Package' },
    { name: 'TbBox', component: TbBox, label: 'Box' },
    { name: 'TbChecks', component: TbChecks, label: 'Checks' },
    { name: 'FiPackage', component: FiPackage, label: 'Package Outline' },
    { name: 'FiTruck', component: FiTruck, label: 'Truck Outline' },
    { name: 'IoMdCheckmarkCircleOutline', component: IoMdCheckmarkCircleOutline, label: 'Check Circle' },
    { name: 'IoMdPrint', component: IoMdPrint, label: 'Print' },
    { name: 'TbClock', component: TbClock, label: 'Clock' },
    { name: 'BiPackage', component: BiPackage, label: 'Package Alt' },
]

const getIconComponent = (iconName) => {
    const icon = AVAILABLE_ICONS.find(i => i.name === iconName)
    return icon ? icon.component : TbTruckDelivery
}

export default function OrderStatusManagement() {
    const [orderStatuses, setOrderStatuses] = useState([])
    const [loading, setLoading] = useState(false)
    const [expandedStatuses, setExpandedStatuses] = useState({})
    const [showForm, setShowForm] = useState(false)
    const { showToast } = useToast()

    // Form state
    const [form, setForm] = useState({
        statusKey: '',
        displayName: '',
        description: '',
        orderType: 'order',
        color: '#6b7280',
        icon: 'TbTruckDelivery',
        order: 0,
        isActive: true
    })

    const [editingItem, setEditingItem] = useState(null)

    // For scrolling back to the form area on edit
    const [formAnchorId] = useState('order-status-form')

    useEffect(() => {
        fetchOrderStatuses()
    }, [])

    const fetchOrderStatuses = async () => {
        try {
            const response = await fetch('/api/admin/order-statuses')
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
                setShowForm(false)
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
            const response = await fetch('/api/admin/settings', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'order-status', id })
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
            icon: item.icon || 'TbTruckDelivery',
            order: item.order,
            isActive: item.isActive
        })
        setEditingItem(item)
        setShowForm(true)

        // Scroll to form so the edit state is obvious
        if (typeof window !== 'undefined') {
            const el = document.getElementById(formAnchorId)
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
        }
    }

    const cancelEdit = () => {
        resetForm()
        setEditingItem(null)
        setShowForm(false)
    }

    const resetForm = () => {
        setForm({
            statusKey: '',
            displayName: '',
            description: '',
            orderType: 'order',
            color: '#6b7280',
            icon: 'TbTruckDelivery',
            order: 0,
            isActive: true
        })
        setEditingItem(null)
    }

    const toggleStatus = (statusKey) => {
        setExpandedStatuses(prev => ({
            ...prev,
            [statusKey]: !prev[statusKey]
        }))
    }

    // Group statuses by order type and sort by display order (gaps and duplicates allowed)
    const sortByDisplayOrder = (list) =>
        [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

    const groupedStatuses = {
        order: sortByDisplayOrder(orderStatuses.filter(s => s.orderType === 'order')),
        printOrder: sortByDisplayOrder(orderStatuses.filter(s => s.orderType === 'printOrder'))
    }

    return (
        <div className="flex flex-col gap-4 sm:gap-6 p-6 md:p-12 bg-borderColor/30 min-h-screen">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h2 className="text-xl sm:text-2xl font-semibold text-textColor">Order Status Management</h2>
                    <p className="text-xs sm:text-sm text-lightColor mt-1">Create and manage custom order statuses for your creators</p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-xs sm:text-sm font-medium w-full sm:w-auto"
                >
                    <MdAdd size={18} />
                    Add Status
                </button>
            </div>

            {showForm && (
                <div id={formAnchorId} className="bg-white border border-borderColor rounded-xl p-4 sm:p-6 shadow-sm animate-slideDown">
                    <h3 className="text-base sm:text-lg font-semibold text-textColor mb-4">
                        {editingItem ? 'Edit Order Status' : 'Create New Order Status'}
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            <div>
                                <label className="block text-sm font-medium text-textColor mb-2">Status Key *</label>
                                <input
                                    type="text"
                                    value={form.statusKey}
                                    onChange={(e) => setForm(prev => ({ ...prev, statusKey: e.target.value }))}
                                    className="formInput"
                                    placeholder="e.g., awaiting_shipment"
                                    required
                                    disabled={editingItem}
                                />
                                <p className="text-xs text-lightColor mt-1">Unique identifier (snake_case, cannot be changed)</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-textColor mb-2">Display Name *</label>
                                <input
                                    type="text"
                                    value={form.displayName}
                                    onChange={(e) => setForm(prev => ({ ...prev, displayName: e.target.value }))}
                                    className="formInput"
                                    placeholder="e.g., Awaiting Shipment"
                                    required
                                />
                                <p className="text-xs text-lightColor mt-1">User-friendly name</p>
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-textColor mb-2">Description</label>
                                <textarea
                                    value={form.description}
                                    onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                                    className="formInput"
                                    rows="2"
                                    placeholder="Brief description of this status..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-textColor mb-2">Order Type *</label>
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
                                <label className="block text-sm font-medium text-textColor mb-2">Display Order</label>
                                <input
                                    type="number"
                                    value={form.order}
                                    onChange={(e) => {
                                        const raw = e.target.value
                                        const parsed = raw === '' ? '' : parseInt(raw, 10)
                                        setForm(prev => ({ ...prev, order: isNaN(parsed) ? '' : parsed }))
                                    }}
                                    className="formInput"
                                    min="0"
                                    placeholder="0"
                                />
                                <p className="text-xs text-lightColor mt-1">
                                    Lower numbers appear first. Same numbers have equal priority.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-textColor mb-2">Color</label>
                                <div className="flex gap-2">
                                    <input
                                        type="color"
                                        value={form.color}
                                        onChange={(e) => setForm(prev => ({ ...prev, color: e.target.value }))}
                                        className="w-12 h-10 border border-borderColor rounded cursor-pointer"
                                    />
                                    <input
                                        type="text"
                                        value={form.color}
                                        onChange={(e) => setForm(prev => ({ ...prev, color: e.target.value }))}
                                        className="formInput flex-1 font-mono text-sm"
                                        placeholder="#6b7280"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-textColor mb-2">Icon</label>
                                <div className="grid grid-cols-5 gap-2">
                                    {AVAILABLE_ICONS.map(icon => {
                                        const Icon = icon.component
                                        const isSelected = form.icon === icon.name
                                        return (
                                            <button
                                                key={icon.name}
                                                type="button"
                                                onClick={() => setForm(prev => ({ ...prev, icon: icon.name }))}
                                                className={`p-3 border-2 rounded-lg transition-all ${isSelected
                                                    ? 'border-black bg-black/5'
                                                    : 'border-borderColor hover:border-lightColor'
                                                    }`}
                                                title={icon.label}
                                            >
                                                <Icon size={20} className={isSelected ? 'text-black' : 'text-lightColor'} />
                                            </button>
                                        )
                                    })}
                                </div>
                                <p className="text-xs text-lightColor mt-2">Selected: {AVAILABLE_ICONS.find(i => i.name === form.icon)?.label}</p>
                            </div>

                            <div className="md:col-span-2 flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="isActive"
                                    checked={form.isActive}
                                    onChange={(e) => setForm(prev => ({ ...prev, isActive: e.target.checked }))}
                                    className="w-4 h-4 rounded border-borderColor"
                                />
                                <label htmlFor="isActive" className="text-sm font-medium text-textColor">
                                    Active (visible to creators)
                                </label>
                            </div>
                        </div>

                        <div className="flex gap-2 pt-4 border-t border-borderColor">
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-50"
                            >
                                {loading ? 'Saving...' : (editingItem ? 'Update Status' : 'Create Status')}
                            </button>
                            <button
                                type="button"
                                onClick={cancelEdit}
                                className="px-4 py-2 border border-borderColor rounded-lg hover:bg-baseColor transition-colors text-sm font-medium"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white border border-borderColor rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-borderColor bg-linear-to-r from-borderColor/60 to-borderColor/80">
                    <h3 className="text-sm font-semibold text-textColor uppercase tracking-wide">Regular Orders</h3>
                    <p className="text-xs text-lightColor mt-1">{groupedStatuses.order.length} status{groupedStatuses.order.length !== 1 ? 'es' : ''}</p>
                </div>
                <div className="p-4 space-y-2">
                    {groupedStatuses.order.length === 0 ? (
                        <div className="text-center py-8 text-lightColor text-sm">
                            <MdOutlineLightbulb className="mx-auto mb-2" size={24} />
                            <p>No custom regular order statuses yet</p>
                        </div>
                    ) : (
                        groupedStatuses.order
                            .map((status) => {
                                const Icon = getIconComponent(status.icon)
                                const isExpanded = expandedStatuses[status.statusKey]
                                const isBuiltIn = status.isHardcoded

                                return (
                                    <div key={status._id || status.statusKey} className="border border-borderColor rounded-lg overflow-hidden">
                                        <button
                                            onClick={() => !isBuiltIn && toggleStatus(status.statusKey)}
                                            className="w-full p-4 flex items-center justify-between hover:bg-baseColor/50 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                                                    style={{ backgroundColor: `${status.color}20` }}
                                                >
                                                    <Icon size={20} style={{ color: status.color }} />
                                                </div>
                                                <div className="text-left">
                                                    <div className="font-medium text-sm text-textColor">{status.displayName}</div>
                                                    <div className="text-xs text-lightColor flex items-center gap-2 mt-0.5 flex-wrap">
                                                        <span className="font-mono">{status.statusKey}</span>
                                                        <span className="px-2 py-0.5 bg-borderColor/60 rounded text-[10px] font-mono">
                                                            #{typeof status.order === 'number' ? status.order : 0}
                                                        </span>
                                                        {isBuiltIn && <span className="px-2 py-0.5 bg-gray-100 rounded text-[10px]">Built-in</span>}
                                                        {!status.isActive && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px]">Inactive</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            {!isBuiltIn && (
                                                <div className="flex items-center gap-2">
                                                    {isExpanded ? (
                                                        <MdExpandLess className="text-xl text-lightColor" />
                                                    ) : (
                                                        <MdExpandMore className="text-xl text-lightColor" />
                                                    )}
                                                </div>
                                            )}
                                        </button>

                                        {isExpanded && !isBuiltIn && (
                                            <div className="p-4 border-t border-borderColor bg-baseColor/30 animate-slideDown">
                                                {status.description && (
                                                    <p className="text-sm text-lightColor mb-4">{status.description}</p>
                                                )}
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => startEdit(status)}
                                                        className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-xs font-medium"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(status._id)}
                                                        className="px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-xs font-medium"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                    )}
                </div>
            </div>

            {/* Print Orders Section */}
            <div className="bg-white border border-borderColor rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-borderColor bg-linear-to-r from-borderColor/60 to-borderColor/80">
                    <h3 className="text-sm font-semibold text-textColor uppercase tracking-wide">Print Orders</h3>
                    <p className="text-xs text-lightColor mt-1">{groupedStatuses.printOrder.length} status{groupedStatuses.printOrder.length !== 1 ? 'es' : ''}</p>
                </div>
                <div className="p-4 space-y-2">
                    {groupedStatuses.printOrder.length === 0 ? (
                        <div className="text-center py-8 text-lightColor text-sm">
                            <MdOutlineLightbulb className="mx-auto mb-2" size={24} />
                            <p>No custom print order statuses yet</p>
                        </div>
                    ) : (
                        groupedStatuses.printOrder
                            .map((status) => {
                                const Icon = getIconComponent(status.icon)
                                const isExpanded = expandedStatuses[status.statusKey]
                                const isBuiltIn = status.isHardcoded

                                return (
                                    <div key={status._id || status.statusKey} className="border border-borderColor rounded-lg overflow-hidden">
                                        <button
                                            onClick={() => !isBuiltIn && toggleStatus(status.statusKey)}
                                            className="w-full p-4 flex items-center justify-between hover:bg-baseColor/50 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                                                    style={{ backgroundColor: `${status.color}20` }}
                                                >
                                                    <Icon size={20} style={{ color: status.color }} />
                                                </div>
                                                <div className="text-left">
                                                    <div className="font-medium text-sm text-textColor">{status.displayName}</div>
                                                    <div className="text-xs text-lightColor flex items-center gap-2 mt-0.5 flex-wrap">
                                                        <span className="font-mono">{status.statusKey}</span>
                                                        <span className="px-2 py-0.5 bg-borderColor/60 rounded text-[10px] font-mono">
                                                            #{typeof status.order === 'number' ? status.order : 0}
                                                        </span>
                                                        {isBuiltIn && <span className="px-2 py-0.5 bg-gray-100 rounded text-[10px]">Built-in</span>}
                                                        {!status.isActive && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px]">Inactive</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            {!isBuiltIn && (
                                                <div className="flex items-center gap-2">
                                                    {isExpanded ? (
                                                        <MdExpandLess className="text-xl text-lightColor" />
                                                    ) : (
                                                        <MdExpandMore className="text-xl text-lightColor" />
                                                    )}
                                                </div>
                                            )}
                                        </button>

                                        {isExpanded && !isBuiltIn && (
                                            <div className="p-4 border-t border-borderColor bg-baseColor/30 animate-slideDown">
                                                {status.description && (
                                                    <p className="text-sm text-lightColor mb-4">{status.description}</p>
                                                )}
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => startEdit(status)}
                                                        className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-xs font-medium"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(status._id)}
                                                        className="px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-xs font-medium"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                    )}
                </div>
            </div>
        </div>
    )
}
