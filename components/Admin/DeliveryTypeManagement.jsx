'use client'
import { useState, useEffect } from 'react'
import { useToast } from '@/components/General/ToastProvider'
import { RxCross1 } from 'react-icons/rx'
import { BsPlus, BsChevronDown, BsChevronRight } from 'react-icons/bs'

export default function DeliveryTypeManagement() {
    const [deliveryTypes, setDeliveryTypes] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [expandedDeliveryTypes, setExpandedDeliveryTypes] = useState({})
    const [showDeliveryTypeForm, setShowDeliveryTypeForm] = useState(false)
    const { showToast } = useToast()

    const [formData, setFormData] = useState({
        name: '',
        displayName: '',
        description: '',
        applicableToProductTypes: [],
        pricingTiers: [],
        hasDefaultPrice: false,
        isActive: true
    })

    const [tierForm, setTierForm] = useState({
        minVolume: '',
        maxVolume: '',
        minWeight: '',
        maxWeight: '',
        price: ''
    })

    const toggleDeliveryType = (deliveryTypeName) => {
        setExpandedDeliveryTypes(prev => ({
            ...prev,
            [deliveryTypeName]: !prev[deliveryTypeName]
        }))
    }

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

    const addPricingTier = () => {
        if (!tierForm.minVolume || !tierForm.maxVolume || !tierForm.minWeight || !tierForm.maxWeight || !tierForm.price) {
            showToast('Please fill in all tier fields', 'error')
            return
        }

        const newTier = {
            minVolume: Number(tierForm.minVolume),
            maxVolume: Number(tierForm.maxVolume),
            minWeight: Number(tierForm.minWeight),
            maxWeight: Number(tierForm.maxWeight),
            price: Number(tierForm.price)
        }

        setFormData(prev => ({
            ...prev,
            pricingTiers: [...prev.pricingTiers, newTier],
            hasDefaultPrice: true
        }))

        setTierForm({
            minVolume: '',
            maxVolume: '',
            minWeight: '',
            maxWeight: '',
            price: ''
        })
    }

    const removePricingTier = (index) => {
        setFormData(prev => ({
            ...prev,
            pricingTiers: prev.pricingTiers.filter((_, i) => i !== index),
            hasDefaultPrice: prev.pricingTiers.length > 1
        }))
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
                setFormData({
                    name: '',
                    displayName: '',
                    description: '',
                    applicableToProductTypes: [],
                    pricingTiers: [],
                    hasDefaultPrice: false,
                    isActive: true
                })
                setShowDeliveryTypeForm(false)
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

    if (loading) return (
        <div className="flex items-center justify-center p-12">
            <div className="loader"></div>
        </div>
    )

    return (
        <div className="flex flex-col gap-6 p-6 md:p-12 bg-borderColor/30 min-h-screen">
            {/* Header Section */}
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">Delivery Type Management</h1>
                <p className="text-sm text-lightColor">Configure delivery options with custom pricing tiers for creators</p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 flex-wrap">
                <button
                    onClick={() => setShowDeliveryTypeForm(!showDeliveryTypeForm)}
                    className={`${showDeliveryTypeForm ? 'formBlackButton' : 'formButton2'} transition-all duration-300`}
                >
                    <BsPlus size={18} />
                    New Delivery Type
                </button>
            </div>

            {/* Delivery Type Form - Progressive Disclosure */}
            {showDeliveryTypeForm && (
                <div className="adminDashboardContainer animate-slideDown">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-medium">Add New Delivery Type</h3>
                        <button
                            onClick={() => setShowDeliveryTypeForm(false)}
                            className="toggleXbutton"
                        >
                            <RxCross1 size={14} />
                        </button>
                    </div>
                    <form onSubmit={handleSubmit} className="gap-4 flex flex-col">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className='gap-2 flex flex-col'>
                                <label className="formLabel">URL Name*</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                                    className="formInput"
                                    placeholder="premium-delivery"
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
                                    placeholder="Premium Delivery"
                                    required
                                />
                                <span className="text-xs text-extraLight">Shown to users</span>
                            </div>
                        </div>

                        <div className='gap-2 flex flex-col'>
                            <label className="formLabel">Description</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                className="formInput resize-none"
                                placeholder="Optional instructions for creators (e.g., pickup location, estimated delivery time)"
                                rows={2}
                            />
                            <span className="text-xs text-extraLight">Creators can customize this per product</span>
                        </div>

                        <div className='gap-2 flex flex-col'>
                            <label className="formLabel">Applicable To*</label>
                            <div className="flex gap-4">
                                <label className="flex items-center text-sm text-lightColor cursor-pointer">
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
                                    Shop Products
                                </label>
                                <label className="flex items-center text-sm text-lightColor cursor-pointer">
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
                                    Print Products
                                </label>
                            </div>
                            <span className="text-xs text-extraLight">Select product types this delivery option applies to</span>
                        </div>

                        {/* Pricing Tiers Section */}
                        <div className="border-t border-borderColor pt-4 mt-2">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h4 className="text-sm font-medium text-textColor">Pricing Tiers</h4>
                                    <p className="text-xs text-extraLight mt-1">Define price based on product dimensions and weight</p>
                                </div>
                            </div>

                            {/* Add Tier Form */}
                            <div className="bg-baseColor border border-borderColor rounded-lg p-4 mb-3">
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-extraLight">Min Volume (cm³)</label>
                                        <input
                                            type="number"
                                            value={tierForm.minVolume}
                                            onChange={(e) => setTierForm(prev => ({ ...prev, minVolume: e.target.value }))}
                                            className="formInput text-xs"
                                            placeholder="0"
                                            min="0"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-extraLight">Max Volume (cm³)</label>
                                        <input
                                            type="number"
                                            value={tierForm.maxVolume}
                                            onChange={(e) => setTierForm(prev => ({ ...prev, maxVolume: e.target.value }))}
                                            className="formInput text-xs"
                                            placeholder="1000"
                                            min="0"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-extraLight">Min Weight (g)</label>
                                        <input
                                            type="number"
                                            value={tierForm.minWeight}
                                            onChange={(e) => setTierForm(prev => ({ ...prev, minWeight: e.target.value }))}
                                            className="formInput text-xs"
                                            placeholder="0"
                                            min="0"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-extraLight">Max Weight (g)</label>
                                        <input
                                            type="number"
                                            value={tierForm.maxWeight}
                                            onChange={(e) => setTierForm(prev => ({ ...prev, maxWeight: e.target.value }))}
                                            className="formInput text-xs"
                                            placeholder="500"
                                            min="0"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-extraLight">Price ($)</label>
                                        <input
                                            type="number"
                                            value={tierForm.price}
                                            onChange={(e) => setTierForm(prev => ({ ...prev, price: e.target.value }))}
                                            className="formInput text-xs"
                                            placeholder="5.00"
                                            min="0"
                                            step="0.01"
                                        />
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={addPricingTier}
                                    className="formButton2 mt-3 text-xs"
                                >
                                    <BsPlus size={16} />
                                    Add Tier
                                </button>
                            </div>

                            {/* Display Added Tiers */}
                            {formData.pricingTiers.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    {formData.pricingTiers.map((tier, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 bg-background border border-borderColor rounded-md">
                                            <div className="flex items-center gap-3 flex-wrap text-xs">
                                                <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">
                                                    Vol: {tier.minVolume}-{tier.maxVolume} cm³
                                                </span>
                                                <span className="px-2 py-1 bg-green-50 text-green-700 rounded">
                                                    Weight: {tier.minWeight}-{tier.maxWeight}g
                                                </span>
                                                <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded font-medium">
                                                    ${tier.price.toFixed(2)}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removePricingTier(idx)}
                                                className="p-1.5 text-extraLight hover:text-red-600 transition-colors duration-200 rounded hover:bg-red-50"
                                            >
                                                <RxCross1 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {formData.pricingTiers.length === 0 && (
                                <div className="text-center py-4 text-xs text-extraLight border border-dashed border-borderColor rounded-lg">
                                    No pricing tiers added yet. Add tiers above or leave empty for creator-defined pricing.
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 justify-end pt-2 border-t border-borderColor">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowDeliveryTypeForm(false)
                                    setFormData({
                                        name: '',
                                        displayName: '',
                                        description: '',
                                        applicableToProductTypes: [],
                                        pricingTiers: [],
                                        hasDefaultPrice: false,
                                        isActive: true
                                    })
                                    setTierForm({
                                        minVolume: '',
                                        maxVolume: '',
                                        minWeight: '',
                                        maxWeight: '',
                                        price: ''
                                    })
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
                                {saving ? 'Adding...' : 'Add Delivery Type'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Delivery Types List */}
            <div className="adminDashboardContainer">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-base font-medium">All Delivery Types</h3>
                        <p className="text-xs text-extraLight mt-1">{deliveryTypes.length} total • Digital delivery is always available</p>
                    </div>
                </div>

                {deliveryTypes.length === 0 ? (
                    <div className="text-center py-12 text-extraLight">
                        <p>No custom delivery types yet</p>
                        <p className="text-xs mt-2">Create delivery options for creators to use</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {deliveryTypes.map((dt, idx) => (
                            <div key={dt.name || idx} className="border border-borderColor rounded-lg overflow-hidden transition-all duration-200 hover:border-extraLight">
                                {/* Delivery Type Row */}
                                <div className="flex items-center justify-between p-4 bg-baseColor">
                                    <div className="flex items-center gap-3 flex-1">
                                        {/* Expand/Collapse Button */}
                                        {dt.pricingTiers && dt.pricingTiers.length > 0 && (
                                            <button
                                                onClick={() => toggleDeliveryType(dt.name)}
                                                className="toggleXbutton p-1"
                                                aria-label={expandedDeliveryTypes[dt.name] ? 'Collapse' : 'Expand'}
                                            >
                                                {expandedDeliveryTypes[dt.name] ? (
                                                    <BsChevronDown size={14} />
                                                ) : (
                                                    <BsChevronRight size={14} />
                                                )}
                                            </button>
                                        )}

                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-medium text-sm">{dt.displayName}</span>
                                                <span className="text-xs px-2 py-0.5 bg-borderColor rounded text-lightColor font-mono">{dt.name}</span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                {dt.applicableToProductTypes?.map(type => (
                                                    <span key={type} className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full font-medium">
                                                        {type}
                                                    </span>
                                                ))}
                                                {dt.isHardcoded && (
                                                    <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">
                                                        Built-in
                                                    </span>
                                                )}
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${dt.isActive
                                                    ? 'bg-green-50 text-green-700'
                                                    : 'bg-red-50 text-red-700'
                                                    }`}>
                                                    {dt.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                                {dt.pricingTiers && dt.pricingTiers.length > 0 && (
                                                    <span className="text-xs text-extraLight">
                                                        {dt.pricingTiers.length} pricing tiers
                                                    </span>
                                                )}
                                                {(!dt.pricingTiers || dt.pricingTiers.length === 0) && (
                                                    <span className="text-xs text-extraLight">
                                                        Creator-defined pricing
                                                    </span>
                                                )}
                                            </div>
                                            {dt.description && (
                                                <p className="text-xs text-lightColor mt-2">{dt.description}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleToggleActive(dt.name, dt.isActive)}
                                            className={`text-xs px-3 py-1.5 rounded transition-all duration-200 font-medium ${dt.isActive
                                                    ? 'border border-borderColor hover:bg-borderColor/30 text-lightColor'
                                                    : 'bg-textColor text-background hover:bg-textColor/90'
                                                }`}
                                        >
                                            {dt.isActive ? 'Deactivate' : 'Activate'}
                                        </button>

                                        {!dt.isHardcoded && (
                                            <button
                                                onClick={() => handleDelete(dt.name)}
                                                className="p-2 text-extraLight hover:text-red-600 transition-colors duration-200 rounded hover:bg-red-50"
                                                aria-label="Delete delivery type"
                                            >
                                                <RxCross1 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Pricing Tiers List - Collapsible */}
                                {dt.pricingTiers && dt.pricingTiers.length > 0 && expandedDeliveryTypes[dt.name] && (
                                    <div className="border-t border-borderColor bg-background/50">
                                        <div className="p-4">
                                            <h4 className="text-xs font-medium text-lightColor mb-3">Pricing Tiers</h4>
                                            <div className="flex flex-col gap-2">
                                                {dt.pricingTiers.map((tier, tidx) => (
                                                    <div
                                                        key={tidx}
                                                        className="flex items-center justify-between p-3 bg-background border border-borderColor rounded-md"
                                                    >
                                                        <div className="flex items-center gap-3 flex-wrap text-xs">
                                                            <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">
                                                                Vol: {tier.minVolume}-{tier.maxVolume} cm³
                                                            </span>
                                                            <span className="px-2 py-1 bg-green-50 text-green-700 rounded">
                                                                Weight: {tier.minWeight}-{tier.maxWeight}g
                                                            </span>
                                                            <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded font-medium">
                                                                ${tier.price.toFixed(2)}
                                                            </span>
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
