'use client'
import { useState, useEffect } from 'react'
import { useToast } from '@/components/General/ToastProvider'
import { RxCross1 } from 'react-icons/rx'
import { BsPlus, BsChevronDown, BsChevronRight } from 'react-icons/bs'

export default function CategoryManagement() {
    const [categories, setCategories] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [expandedCategories, setExpandedCategories] = useState({})
    const [showCategoryForm, setShowCategoryForm] = useState(false)
    const [showSubcategoryForm, setShowSubcategoryForm] = useState(false)
    const { showToast } = useToast()

    const [formData, setFormData] = useState({
        name: '',
        displayName: '',
        type: 'shop',
        isActive: true
    })

    const [subForm, setSubForm] = useState({
        parentName: '',
        name: '',
        displayName: '',
        isActive: true
    })

    const toggleCategory = (categoryName) => {
        setExpandedCategories(prev => ({
            ...prev,
            [categoryName]: !prev[categoryName]
        }))
    }

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
                setShowCategoryForm(false)
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

    const handleSubSubmit = async (e) => {
        e.preventDefault()
        if (!subForm.parentName || !subForm.name || !subForm.displayName) {
            showToast('Please fill in all required fields', 'error')
            return
        }

        setSaving(true)
        try {
            const response = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'subcategory',
                    action: 'add',
                    data: subForm
                })
            })

            const result = await response.json()
            if (response.ok) {
                showToast('Subcategory added!', 'success')
                setSubForm({ parentName: '', name: '', displayName: '', isActive: true })
                setShowSubcategoryForm(false)
                fetchCategories()
            } else {
                showToast(result.error || 'Failed to add subcategory', 'error')
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteSub = async (parentName, name) => {
        if (!confirm('Delete this subcategory?')) return

        try {
            const response = await fetch('/api/admin/settings', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'subcategory', parentName, name })
            })

            if (response.ok) {
                showToast('Subcategory deleted!', 'success')
                fetchCategories()
            } else {
                showToast('Failed to delete subcategory', 'error')
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error')
        }
    }

    const handleToggleSubActive = async (parentName, name, isActive) => {
        try {
            const response = await fetch('/api/admin/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'subcategory',
                    action: 'toggleActive',
                    parentName,
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

    if (loading) return (
        <div className="flex items-center justify-center p-12">
            <div className="loader"></div>
        </div>
    )

    return (
        <div className="flex flex-col gap-6 p-6 md:p-12 bg-borderColor/30 min-h-screen">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">Category Management</h1>
                <p className="text-sm text-lightColor">Organize your products with categories and subcategories</p>
            </div>

            <div className="flex gap-3 flex-wrap">
                <button
                    onClick={() => {
                        setShowCategoryForm(!showCategoryForm)
                        setShowSubcategoryForm(false)
                    }}
                    className={`${showCategoryForm ? 'formBlackButton' : 'formButton2'} transition-all duration-300`}
                >
                    <BsPlus size={18} />
                    New Category
                </button>
                <button
                    onClick={() => {
                        setShowSubcategoryForm(!showSubcategoryForm)
                        setShowCategoryForm(false)
                    }}
                    className={`${showSubcategoryForm ? 'formBlackButton' : 'formButton2'} transition-all duration-300`}
                >
                    <BsPlus size={18} />
                    New Subcategory
                </button>
            </div>

            {showCategoryForm && (
                <div className="adminDashboardContainer animate-slideDown">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-medium">Add New Category</h3>
                        <button
                            onClick={() => setShowCategoryForm(false)}
                            className="toggleXbutton"
                        >
                            <RxCross1 size={14} />
                        </button>
                    </div>
                    <form onSubmit={handleSubmit} className="gap-4 flex flex-col">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className='gap-2 flex flex-col'>
                                <label className="formLabel">URL Name*</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                                    className="formInput"
                                    placeholder="electronics"
                                    required
                                />
                                <span className="text-xs text-extraLight">Lowercase, no spaces</span>
                            </div>
                            <div className='gap-2 flex flex-col'>
                                <label className="formLabel">Display Name*</label>
                                <input
                                    type="text"
                                    value={formData.displayName}
                                    onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                                    className="formInput"
                                    placeholder="Electronics"
                                    required
                                />
                                <span className="text-xs text-extraLight">Shown to users</span>
                            </div>
                            <div className='gap-2 flex flex-col'>
                                <label className="formLabel">Type*</label>
                                <select
                                    value={formData.type}
                                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                                    className="formInput"
                                    required
                                >
                                    <option value="shop">Shop</option>
                                    <option value="print">Print</option>
                                </select>
                                <span className="text-xs text-extraLight">Category type</span>
                            </div>
                        </div>

                        <div className="flex gap-2 justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowCategoryForm(false)
                                    setFormData({ name: '', displayName: '', type: 'shop', isActive: true })
                                }}
                                className="formButton2 min-w-24"
                                disabled={saving}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="formBlackButton min-w-24"
                            >
                                {saving ? 'Adding...' : 'Add Category'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {showSubcategoryForm && (
                <div className="adminDashboardContainer animate-slideDown">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-medium">Add New Subcategory</h3>
                        <button
                            onClick={() => setShowSubcategoryForm(false)}
                            className="toggleXbutton"
                        >
                            <RxCross1 size={14} />
                        </button>
                    </div>
                    <form onSubmit={handleSubSubmit} className="gap-4 flex flex-col">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className='gap-2 flex flex-col'>
                                <label className="formLabel">Parent Category*</label>
                                <select
                                    value={subForm.parentName}
                                    onChange={(e) => setSubForm(prev => ({ ...prev, parentName: e.target.value }))}
                                    className="formInput"
                                    required
                                >
                                    <option value="">Select parent</option>
                                    {categories.map(cat => (
                                        <option key={cat.name} value={cat.name}>{cat.displayName}</option>
                                    ))}
                                </select>
                                <span className="text-xs text-extraLight">Choose a category</span>
                            </div>

                            <div className='gap-2 flex flex-col'>
                                <label className="formLabel">URL Name*</label>
                                <input
                                    type="text"
                                    value={subForm.name}
                                    onChange={(e) => setSubForm(prev => ({ ...prev, name: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                                    className="formInput"
                                    placeholder="popular"
                                    required
                                />
                                <span className="text-xs text-extraLight">Lowercase, no spaces</span>
                            </div>
                            <div className='gap-2 flex flex-col'>
                                <label className="formLabel">Display Name*</label>
                                <input
                                    type="text"
                                    value={subForm.displayName}
                                    onChange={(e) => setSubForm(prev => ({ ...prev, displayName: e.target.value }))}
                                    className="formInput"
                                    placeholder="Popular"
                                    required
                                />
                                <span className="text-xs text-extraLight">Shown to users</span>
                            </div>
                        </div>

                        <div className="flex gap-2 justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowSubcategoryForm(false)
                                    setSubForm({ parentName: '', name: '', displayName: '', isActive: true })
                                }}
                                className="formButton2 min-w-24"
                                disabled={saving}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="formBlackButton min-w-24"
                            >
                                {saving ? 'Adding...' : 'Add Subcategory'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Categories List */}
            <div className="adminDashboardContainer">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-base font-medium">All Categories</h3>
                        <p className="text-xs text-extraLight mt-1">{categories.length} total</p>
                    </div>
                </div>

                {categories.length === 0 ? (
                    <div className="text-center py-12 text-extraLight">
                        <p>No categories yet</p>
                        <p className="text-xs mt-2">Create your first category to get started</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {categories.map((cat, idx) => (
                            <div key={cat.name || idx} className="border border-borderColor rounded-lg overflow-hidden group">
                                <div className="flex items-center justify-between p-4 bg-baseColor hover:bg-borderColor/30 transition-all duration-200">
                                    <div className="flex items-center gap-3 flex-1">
                                        {cat.subcategories && cat.subcategories.length > 0 && (
                                            <button
                                                onClick={() => toggleCategory(cat.name)}
                                                className="toggleXbutton p-1"
                                                aria-label={expandedCategories[cat.name] ? 'Collapse' : 'Expand'}
                                            >
                                                {expandedCategories[cat.name] ? (
                                                    <BsChevronDown size={14} />
                                                ) : (
                                                    <BsChevronRight size={14} />
                                                )}
                                            </button>
                                        )}

                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-medium text-sm">{cat.displayName}</span>
                                                <span className="text-xs px-2 py-0.5 bg-borderColor rounded text-lightColor font-mono">{cat.name}</span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full font-medium">
                                                    {cat.type}
                                                </span>
                                                {cat.isHardcoded && (
                                                    <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">
                                                        Built-in
                                                    </span>
                                                )}
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.isActive
                                                    ? 'bg-green-50 text-green-700'
                                                    : 'bg-red-50 text-red-700'
                                                    }`}>
                                                    {cat.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                                {cat.subcategories && cat.subcategories.length > 0 && (
                                                    <span className="text-xs text-extraLight">
                                                        {cat.subcategories.length} subcategories
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleToggleActive(cat.name, cat.isActive)}
                                            className={`text-xs px-3 py-1.5 rounded transition-all duration-200 font-medium ${cat.isActive
                                                ? 'border border-borderColor hover:bg-borderColor/30 text-lightColor'
                                                : 'bg-textColor text-background hover:bg-textColor/90'
                                                }`}
                                        >
                                            {cat.isActive ? 'Deactivate' : 'Activate'}
                                        </button>

                                        {!cat.isHardcoded && (
                                            <button
                                                onClick={() => handleDelete(cat.name)}
                                                className="p-2 text-extraLight hover:text-red-600 transition-colors duration-200 rounded hover:bg-red-50"
                                                aria-label="Delete category"
                                            >
                                                <RxCross1 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {cat.subcategories && cat.subcategories.length > 0 && expandedCategories[cat.name] && (
                                    <div className="border-t border-borderColor bg-background/50">
                                        <div className="p-4">
                                            <div className="flex flex-col gap-2">
                                                {cat.subcategories.map((sub, sidx) => (
                                                    <div
                                                        key={sub.name || sidx}
                                                        className="flex items-center justify-between p-3 border border-borderColor rounded-md bg-background hover:bg-borderColor/30 transition-all duration-200"
                                                    >
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-medium text-sm">{sub.displayName}</span>
                                                                <span className="text-xs px-2 py-0.5 bg-borderColor rounded text-lightColor font-mono">{sub.name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1.5">
                                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sub.isActive
                                                                    ? 'bg-green-50 text-green-700'
                                                                    : 'bg-red-50 text-red-700'
                                                                    }`}>
                                                                    {sub.isActive ? 'Active' : 'Inactive'}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleToggleSubActive(cat.name, sub.name, sub.isActive)}
                                                                className={`text-xs px-3 py-1.5 rounded transition-all duration-200 font-medium ${sub.isActive
                                                                    ? 'border border-borderColor hover:bg-borderColor/30 text-lightColor'
                                                                    : 'bg-textColor text-background hover:bg-textColor/90'
                                                                    }`}
                                                            >
                                                                {sub.isActive ? 'Deactivate' : 'Activate'}
                                                            </button>

                                                            {!sub.isHardcoded && (
                                                                <button
                                                                    onClick={() => handleDeleteSub(cat.name, sub.name)}
                                                                    className="p-2 text-extraLight hover:text-red-600 transition-colors duration-200 rounded hover:bg-red-50"
                                                                    aria-label="Delete subcategory"
                                                                >
                                                                    <RxCross1 size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
