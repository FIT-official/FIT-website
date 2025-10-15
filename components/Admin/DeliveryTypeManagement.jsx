'use client'
import { useState, useEffect } from 'react'
import { useToast } from '@/components/General/ToastProvider'
import { RxCross1 } from 'react-icons/rx'
import { BsPlus } from 'react-icons/bs'

export default function DeliveryTypeManagement() {
    const [deliveryTypes, setDeliveryTypes] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const { showToast } = useToast()

    const [formData, setFormData] = useState({
        name: '',
        displayName: '',
        applicableToProductTypes: [],
        isActive: true
    })

    useEffect(() => {
        fetchDeliveryTypes()
    }, [])

    const fetchDeliveryTypes = async () => {
        try {
            const response = await fetch('/api/admin/settings')
            const data = await response.json()
            if (response.ok) {
                setDeliveryTypes(data.deliveryTypes || [])
            } else {
                showToast('Failed to fetch delivery types', 'error')
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error')
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!formData.name || !formData.displayName || formData.applicableToProductTypes.length === 0) {
            showToast('Please fill in all required fields', 'error')
            return
        }

        setSaving(true)
        try {
            const response = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'deliveryType',
                    action: 'add',
                    data: formData
                })
            })

            const result = await response.json()
            if (response.ok) {
                showToast('Delivery type added!', 'success')
                setFormData({ name: '', displayName: '', applicableToProductTypes: [], isActive: true })
                fetchDeliveryTypes()
            } else {
                showToast(result.error || 'Failed to add', 'error')
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (name) => {
        if (!confirm('Delete this delivery type?')) return

        try {
            const response = await fetch('/api/admin/settings', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'deliveryType', name })
            })

            if (response.ok) {
                showToast('Deleted!', 'success')
                fetchDeliveryTypes()
            } else {
                showToast('Failed to delete', 'error')
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error')
        }
    }

    const handleToggleActive = async (name, isActive) => {
        try {
            const response = await fetch('/api/admin/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'deliveryType',
                    action: 'toggleActive',
                    name,
                    isActive: !isActive
                })
            })

            if (response.ok) {
                showToast('Updated!', 'success')
                fetchDeliveryTypes()
            } else {
                showToast('Failed to update', 'error')
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error')
        }
    }

    if (loading) return <div className="p-8">Loading...</div>

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-lg border border-borderColor p-6">
                <h2 className="text-xl font-semibold mb-4">Add Delivery Type</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Name*</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                className="w-full p-2 border border-borderColor rounded"
                                placeholder="customDelivery"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Display Name*</label>
                            <input
                                type="text"
                                value={formData.displayName}
                                onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                                className="w-full p-2 border border-borderColor rounded"
                                placeholder="Custom Delivery"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">Applicable To*</label>
                        <div className="flex gap-4">
                            <label className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={formData.applicableToProductTypes.includes('shop')}
                                    onChange={(e) => {
                                        const checked = e.target.checked
                                        setFormData(prev => ({
                                            ...prev,
                                            applicableToProductTypes: checked
                                                ? [...prev.applicableToProductTypes, 'shop']
                                                : prev.applicableToProductTypes.filter(t => t !== 'shop')
                                        }))
                                    }}
                                    className="mr-2"
                                />
                                Shop
                            </label>
                            <label className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={formData.applicableToProductTypes.includes('print')}
                                    onChange={(e) => {
                                        const checked = e.target.checked
                                        setFormData(prev => ({
                                            ...prev,
                                            applicableToProductTypes: checked
                                                ? [...prev.applicableToProductTypes, 'print']
                                                : prev.applicableToProductTypes.filter(t => t !== 'print')
                                        }))
                                    }}
                                    className="mr-2"
                                />
                                Print
                            </label>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:bg-gray-400"
                    >
                        {saving ? 'Adding...' : 'Add'}
                        <BsPlus className="ml-1" size={20} />
                    </button>
                </form>
            </div>

            <div className="bg-white rounded-lg border border-borderColor p-6">
                <h2 className="text-xl font-semibold mb-4">Manage Delivery Types</h2>

                <div className="space-y-4">
                    {deliveryTypes.map((dt, idx) => (
                        <div key={dt.name || idx} className="flex items-center justify-between p-4 border border-borderColor rounded-lg">
                            <div className="flex-1">
                                <div className="flex items-center gap-3">
                                    <h3 className="font-medium">{dt.displayName}</h3>
                                    <span className="text-xs px-2 py-1 bg-gray-100 rounded">{dt.name}</span>
                                    {dt.isHardcoded && (
                                        <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">Built-in</span>
                                    )}
                                    <span className={`text-xs px-2 py-1 rounded ${dt.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                        {dt.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600 mt-1">
                                    For: {dt.applicableToProductTypes?.join(', ') || 'All'}
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleToggleActive(dt.name, dt.isActive)}
                                    className={`px-3 py-1 text-xs rounded ${dt.isActive ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                                        }`}
                                >
                                    {dt.isActive ? 'Deactivate' : 'Activate'}
                                </button>

                                {!dt.isHardcoded && (
                                    <button
                                        onClick={() => handleDelete(dt.name)}
                                        className="p-1 text-red-600 hover:text-red-800"
                                    >
                                        <RxCross1 size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
