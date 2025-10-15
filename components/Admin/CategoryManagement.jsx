'use client'
import { useState, useEffect } from 'react'
import { useToast } from '@/components/General/ToastProvider'
import { RxCross1 } from 'react-icons/rx'
import { BsPlus } from 'react-icons/bs'

export default function CategoryManagement() {
    const [categories, setCategories] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const { showToast } = useToast()

    const [formData, setFormData] = useState({
        name: '',
        displayName: '',
        type: 'shop',
        isActive: true
    })

    useEffect(() => {
        fetchCategories()
    }, [])

    const fetchCategories = async () => {
        try {
            const response = await fetch('/api/admin/settings')
            const data = await response.json()
            if (response.ok) {
                setCategories(data.categories || [])
            } else {
                showToast('Failed to fetch categories', 'error')
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error')
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!formData.name || !formData.displayName) {
            showToast('Please fill in all required fields', 'error')
            return
        }

        setSaving(true)
        try {
            const response = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'category',
                    action: 'add',
                    data: formData
                })
            })

            const result = await response.json()
            if (response.ok) {
                showToast('Category added!', 'success')
                setFormData({ name: '', displayName: '', type: 'shop', isActive: true })
                fetchCategories()
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
        if (!confirm('Delete this category?')) return

        try {
            const response = await fetch('/api/admin/settings', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'category', name })
            })

            if (response.ok) {
                showToast('Deleted!', 'success')
                fetchCategories()
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
                    type: 'category',
                    action: 'toggleActive',
                    name,
                    isActive: !isActive
                })
            })

            if (response.ok) {
                showToast('Updated!', 'success')
                fetchCategories()
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
                <h2 className="text-xl font-semibold mb-4">Add Category</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Name*</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                className="w-full p-2 border border-borderColor rounded"
                                placeholder="electronics"
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
                                placeholder="Electronics"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Type*</label>
                            <select
                                value={formData.type}
                                onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                                className="w-full p-2 border border-borderColor rounded"
                                required
                            >
                                <option value="shop">Shop</option>
                                <option value="print">Print</option>
                            </select>
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
                <h2 className="text-xl font-semibold mb-4">Manage Categories</h2>
                
                <div className="space-y-4">
                    {categories.map((cat, idx) => (
                        <div key={cat.name || idx} className="flex items-center justify-between p-4 border border-borderColor rounded-lg">
                            <div className="flex-1">
                                <div className="flex items-center gap-3">
                                    <h3 className="font-medium">{cat.displayName}</h3>
                                    <span className="text-xs px-2 py-1 bg-gray-100 rounded">{cat.name}</span>
                                    <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded">{cat.type}</span>
                                    {cat.isHardcoded && (
                                        <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">Built-in</span>
                                    )}
                                    <span className={`text-xs px-2 py-1 rounded ${
                                        cat.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                    }`}>
                                        {cat.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleToggleActive(cat.name, cat.isActive)}
                                    className={`px-3 py-1 text-xs rounded ${
                                        cat.isActive ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                                    }`}
                                >
                                    {cat.isActive ? 'Deactivate' : 'Activate'}
                                </button>
                                
                                {!cat.isHardcoded && (
                                    <button
                                        onClick={() => handleDelete(cat.name)}
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
