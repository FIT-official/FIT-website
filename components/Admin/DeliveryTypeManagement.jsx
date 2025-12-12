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
        basePricing: {
            basePrice: '',
            volumeFactor: '',
            weightFactor: '',
            minPrice: '',
            maxPrice: '',
            freeShippingThreshold: ''
        },
        isActive: true
    })

    const [customExample, setCustomExample] = useState({
        volume: '',
        weight: ''
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
                    basePricing: {
                        basePrice: '',
                        volumeFactor: '',
                        weightFactor: '',
                        minPrice: '',
                        maxPrice: '',
                        freeShippingThreshold: ''
                    },
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
            const deliveryType = deliveryTypes.find(dt => dt.name === name && !dt.isHardcoded)
            if (!deliveryType || !deliveryType._id) {
                showToast('Unable to delete: missing id for this delivery type', 'error')
                return
            }

            const response = await fetch('/api/admin/settings', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'delivery-type', id: deliveryType._id })
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
                    type: 'delivery-type',
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
        <div className="flex flex-col gap-4 sm:gap-6 p-6 md:p-12 bg-borderColor/30 min-h-screen">
            {/* Header Section */}
            <div className="flex flex-col gap-2">
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Delivery Type Management</h1>
                <p className="text-xs sm:text-sm text-lightColor">Configure delivery options with custom pricing tiers for creators</p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 sm:gap-3 flex-wrap">
                <button
                    onClick={() => setShowDeliveryTypeForm(!showDeliveryTypeForm)}
                    className={`${showDeliveryTypeForm ? 'formBlackButton' : 'formButton2'} transition-all duration-300 text-xs sm:text-sm`}
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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

                        {/* Formula-Based Pricing Section */}
                        <div className="border-t border-borderColor pt-4 mt-2">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h4 className="text-sm font-medium text-textColor">Automatic Pricing Formula</h4>
                                    <p className="text-xs text-extraLight mt-1">Price = Base Price + (Volume × Volume Factor) + (Weight × Weight Factor)</p>
                                </div>
                            </div>

                            <div className="bg-baseColor border border-borderColor rounded-lg p-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-medium text-textColor">Base Price ($)</label>
                                        <input
                                            type="number"
                                            value={formData.basePricing.basePrice}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                basePricing: { ...prev.basePricing, basePrice: e.target.value }
                                            }))}
                                            className="formInput"
                                            placeholder="5.00"
                                            min="0"
                                            step="0.01"
                                        />
                                        <span className="text-xs text-extraLight">Flat fee added to all deliveries</span>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-medium text-textColor">Volume Factor ($/cm³)</label>
                                        <input
                                            type="number"
                                            value={formData.basePricing.volumeFactor}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                basePricing: { ...prev.basePricing, volumeFactor: e.target.value }
                                            }))}
                                            className="formInput"
                                            placeholder="0.001"
                                            min="0"
                                            step="0.0001"
                                        />
                                        <span className="text-xs text-extraLight">Cost per cubic centimeter</span>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-medium text-textColor">Weight Factor ($/g)</label>
                                        <input
                                            type="number"
                                            value={formData.basePricing.weightFactor}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                basePricing: { ...prev.basePricing, weightFactor: e.target.value }
                                            }))}
                                            className="formInput"
                                            placeholder="0.01"
                                            min="0"
                                            step="0.001"
                                        />
                                        <span className="text-xs text-extraLight">Cost per gram</span>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-medium text-textColor">Minimum Price ($)</label>
                                        <input
                                            type="number"
                                            value={formData.basePricing.minPrice}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                basePricing: { ...prev.basePricing, minPrice: e.target.value }
                                            }))}
                                            className="formInput"
                                            placeholder="5.00"
                                            min="0"
                                            step="0.01"
                                        />
                                        <span className="text-xs text-extraLight">Floor price (never go below)</span>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-medium text-textColor">Maximum Price ($)</label>
                                        <input
                                            type="number"
                                            value={formData.basePricing.maxPrice}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                basePricing: { ...prev.basePricing, maxPrice: e.target.value }
                                            }))}
                                            className="formInput"
                                            placeholder="50.00"
                                            min="0"
                                            step="0.01"
                                        />
                                        <span className="text-xs text-extraLight">Ceiling price (never exceed)</span>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-medium text-textColor">Free Shipping Threshold ($)</label>
                                        <input
                                            type="number"
                                            value={formData.basePricing.freeShippingThreshold}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                basePricing: { ...prev.basePricing, freeShippingThreshold: e.target.value }
                                            }))}
                                            className="formInput"
                                            placeholder="100.00"
                                            min="0"
                                            step="0.01"
                                        />
                                        <span className="text-xs text-extraLight">Free if product value exceeds (optional)</span>
                                    </div>
                                </div>

                                {/* Pricing Calculator Preview */}
                                {formData.basePricing.basePrice && formData.basePricing.volumeFactor && formData.basePricing.weightFactor && (
                                    <div className="mt-4 pt-4 border-t border-borderColor">
                                        <h5 className="text-xs font-medium text-textColor mb-3">Example Calculations</h5>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            {[
                                                { volume: 1000, weight: 100, label: 'Small Item' },
                                                { volume: 5000, weight: 500, label: 'Medium Item' },
                                                { volume: 10000, weight: 1000, label: 'Large Item' }
                                            ].map(example => {
                                                const calculated = parseFloat(formData.basePricing.basePrice) +
                                                    (example.volume * parseFloat(formData.basePricing.volumeFactor)) +
                                                    (example.weight * parseFloat(formData.basePricing.weightFactor))
                                                const minPrice = parseFloat(formData.basePricing.minPrice) || 0
                                                const maxPrice = parseFloat(formData.basePricing.maxPrice) || Infinity
                                                const finalPrice = Math.max(minPrice, Math.min(maxPrice, calculated))

                                                return (
                                                    <div key={example.label} className="bg-background border border-borderColor rounded p-3">
                                                        <div className="text-xs font-medium text-textColor mb-2">{example.label}</div>
                                                        <div className="text-xs text-extraLight space-y-1">
                                                            <div>{example.volume} cm³ × ${formData.basePricing.volumeFactor}</div>
                                                            <div>{example.weight}g × ${formData.basePricing.weightFactor}</div>
                                                            <div className="pt-1 border-t border-borderColor mt-2 font-medium text-textColor">
                                                                Price: ${finalPrice.toFixed(2)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>

                                        {/* Custom example input */}
                                        <div className="mt-4 pt-4 border-t border-borderColor">
                                            <h5 className="text-xs font-medium text-textColor mb-3">Test Your Own Example</h5>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-xs font-medium text-textColor">Volume (cm³)</label>
                                                    <input
                                                        type="number"
                                                        value={customExample.volume}
                                                        onChange={(e) => setCustomExample(prev => ({ ...prev, volume: e.target.value }))}
                                                        className="formInput"
                                                        placeholder="e.g., 2500"
                                                        min="0"
                                                        step="1"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-xs font-medium text-textColor">Weight (g)</label>
                                                    <input
                                                        type="number"
                                                        value={customExample.weight}
                                                        onChange={(e) => setCustomExample(prev => ({ ...prev, weight: e.target.value }))}
                                                        className="formInput"
                                                        placeholder="e.g., 300"
                                                        min="0"
                                                        step="1"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <span className="text-xs font-medium text-textColor">Calculated Price</span>
                                                    <div className="px-3 py-2 text-xs font-medium text-textColor flex items-center">
                                                        {(() => {
                                                            const basePrice = parseFloat(formData.basePricing.basePrice)
                                                            const volumeFactor = parseFloat(formData.basePricing.volumeFactor)
                                                            const weightFactor = parseFloat(formData.basePricing.weightFactor)
                                                            const minPrice = parseFloat(formData.basePricing.minPrice) || 0
                                                            const maxPrice = isNaN(parseFloat(formData.basePricing.maxPrice)) ? Infinity : parseFloat(formData.basePricing.maxPrice)
                                                            const volume = parseFloat(customExample.volume)
                                                            const weight = parseFloat(customExample.weight)

                                                            if (isNaN(basePrice) || isNaN(volumeFactor) || isNaN(weightFactor) || isNaN(volume) || isNaN(weight)) {
                                                                return <span className="text-extraLight">Enter volume and weight to preview</span>
                                                            }

                                                            const raw = basePrice + (volume * volumeFactor) + (weight * weightFactor)
                                                            const final = Math.max(minPrice, Math.min(maxPrice, raw))
                                                            return `$${final.toFixed(2)}`
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
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
                                        basePricing: {
                                            basePrice: '',
                                            volumeFactor: '',
                                            weightFactor: '',
                                            minPrice: '',
                                            maxPrice: '',
                                            freeShippingThreshold: ''
                                        },
                                        isActive: true
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
                                <div className="flex flex-col gap-3 p-4 bg-baseColor">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        {/* Expand/Collapse Button */}
                                        {dt.basePricing && dt.basePricing.basePrice && (
                                            <button
                                                onClick={() => toggleDeliveryType(dt.name)}
                                                className="toggleXbutton p-1 shrink-0"
                                                aria-label={expandedDeliveryTypes[dt.name] ? 'Collapse' : 'Expand'}
                                            >
                                                {expandedDeliveryTypes[dt.name] ? (
                                                    <BsChevronDown size={14} />
                                                ) : (
                                                    <BsChevronRight size={14} />
                                                )}
                                            </button>
                                        )}

                                        <div className="flex-1 min-w-0">
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
                                                {dt.basePricing && dt.basePricing.basePrice && (
                                                    <span className="text-xs text-extraLight">
                                                        Formula-based pricing
                                                    </span>
                                                )}
                                                {(!dt.basePricing || !dt.basePricing.basePrice) && (
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
                                            className={`text-xs px-3 py-1.5 rounded transition-all duration-200 font-medium whitespace-nowrap ${dt.isActive
                                                ? 'border border-borderColor hover:bg-borderColor/30 text-lightColor'
                                                : 'bg-textColor text-background hover:bg-textColor/90'
                                                }`}
                                        >
                                            {dt.isActive ? 'Deactivate' : 'Activate'}
                                        </button>

                                        {!dt.isHardcoded && (
                                            <button
                                                onClick={() => handleDelete(dt.name)}
                                                className="p-2 text-extraLight hover:text-red-600 transition-colors duration-200 rounded hover:bg-red-50 shrink-0"
                                                aria-label="Delete delivery type"
                                            >
                                                <RxCross1 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Pricing Formula Details - Collapsible */}
                                {dt.basePricing && dt.basePricing.basePrice && expandedDeliveryTypes[dt.name] && (
                                    <div className="border-t border-borderColor bg-background/50">
                                        <div className="p-4">
                                            <h4 className="text-xs font-medium text-lightColor mb-3">Pricing Formula</h4>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-extraLight">Base Price</span>
                                                    <span className="font-medium text-textColor">${dt.basePricing.basePrice}</span>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-extraLight">Volume Factor</span>
                                                    <span className="font-medium text-textColor">${dt.basePricing.volumeFactor}/cm³</span>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-extraLight">Weight Factor</span>
                                                    <span className="font-medium text-textColor">${dt.basePricing.weightFactor}/g</span>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-extraLight">Min Price</span>
                                                    <span className="font-medium text-textColor">${dt.basePricing.minPrice}</span>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-extraLight">Max Price</span>
                                                    <span className="font-medium text-textColor">${dt.basePricing.maxPrice}</span>
                                                </div>
                                                {dt.basePricing.freeShippingThreshold && (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-extraLight">Free Shipping</span>
                                                        <span className="font-medium text-textColor">${dt.basePricing.freeShippingThreshold}</span>
                                                    </div>
                                                )}
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
