import React, { useState, useEffect } from 'react'
import { useAdminSettings } from '@/utils/AdminSettingsContext';
import { getDeliveryTypeApplicability as getDeliveryTypeApplicabilityHelper, toggleDeliveryType as toggleDeliveryTypeHelper, updateCustomPrice as updateCustomPriceHelper, updateCustomDescription as updateCustomDescriptionHelper, resetToDefaultPrice as resetToDefaultPriceHelper } from '@/utils/deliveryTypeHelpers'
import { MdExpandMore, MdExpandLess, MdCheckCircle, MdRadioButtonUnchecked, MdOutlineLightbulb } from 'react-icons/md'
import { IoMdCube } from 'react-icons/io'
import { FiPackage, FiTruck, FiSearch } from 'react-icons/fi'
import { BiReset } from 'react-icons/bi'
import { RxDimensions } from 'react-icons/rx'
import FieldErrorBanner from './FieldErrorBanner'

export default function ShippingFields({ form, handleChange, setForm, hideDimensions, hidePriceEditor, missingFields = [], availableDeliveryTypes: propAvailableDeliveryTypes }) {
    const [availableDeliveryTypes, setAvailableDeliveryTypes] = useState([])
    const [loadingDeliveryTypes, setLoadingDeliveryTypes] = useState(true)
    const [selectedDeliveryTypes, setSelectedDeliveryTypes] = useState({})
    const [initialized, setInitialized] = useState(false)
    const [expandedDimensions, setExpandedDimensions] = useState(false)
    const [expandedDelivery, setExpandedDelivery] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')

    // Use admin settings context for delivery types
    const { settings: adminSettings, loading: adminSettingsLoading, error: adminSettingsError } = useAdminSettings();
    useEffect(() => {
        if (propAvailableDeliveryTypes) {
            setAvailableDeliveryTypes(propAvailableDeliveryTypes);
            setLoadingDeliveryTypes(false);
        } else if (adminSettingsLoading) return;
        else if (adminSettings && adminSettings.deliveryTypes) {
            setAvailableDeliveryTypes(adminSettings.deliveryTypes || []);
            setLoadingDeliveryTypes(false);
        }
    }, [adminSettings, adminSettingsLoading, propAvailableDeliveryTypes]);

    useEffect(() => {
        if (initialized) return;
        const selected = {}
        if (form.delivery?.deliveryTypes && form.delivery.deliveryTypes.length > 0) {
            form.delivery.deliveryTypes.forEach(dt => {
                selected[dt.type] = {
                    enabled: true,
                    customPrice: dt.customPrice ?? dt.price ?? null,
                    customDescription: dt.customDescription ?? '',
                    defaultPrice: dt.price ?? null
                }
            })
        }
        setSelectedDeliveryTypes(selected)
        setInitialized(true)
    }, [form.delivery?.deliveryTypes, initialized])

    const hasDigitalDelivery = form.delivery?.deliveryTypes?.some(dt => dt.type === 'digital' || dt === 'digital')

    const getDeliveryTypeApplicability = (deliveryType) => getDeliveryTypeApplicabilityHelper(deliveryType, form)

    const toggleDeliveryType = (deliveryType) => {
        toggleDeliveryTypeHelper({
            deliveryType,
            form,
            selectedDeliveryTypes,
            setSelectedDeliveryTypes,
            setForm,
            initialized,
            setInitialized,
            getDeliveryTypeApplicabilityImpl: getDeliveryTypeApplicability
        })
    }

    // Update custom price for a delivery type
    const updateCustomPrice = (typeName, price) => {
        setSelectedDeliveryTypes(updateCustomPriceHelper(selectedDeliveryTypes, typeName, price))
    }

    // Update custom description for a delivery type
    const updateCustomDescription = (typeName, description) => {
        setSelectedDeliveryTypes(updateCustomDescriptionHelper(selectedDeliveryTypes, typeName, description))
    }

    // Reset to default price
    const resetToDefaultPrice = (typeName) => {
        setSelectedDeliveryTypes(resetToDefaultPriceHelper(selectedDeliveryTypes, typeName))
    }

    // Update form when selected delivery types change
    useEffect(() => {
        const deliveryTypes = Object.entries(selectedDeliveryTypes)
            .filter(([_, data]) => data.enabled)
            .map(([type, data]) => ({
                type,
                price: data.customPrice ?? 0,
                customPrice: data.customPrice,
                customDescription: data.customDescription || null
            }))

        // Only update if there's an actual change
        const currentTypes = form.delivery?.deliveryTypes || []
        const hasChanged = JSON.stringify(currentTypes) !== JSON.stringify(deliveryTypes)

        if (hasChanged) {
            setForm(prev => ({
                ...prev,
                delivery: {
                    ...prev.delivery,
                    deliveryTypes
                }
            }))
        }
    }, [selectedDeliveryTypes, form.delivery?.deliveryTypes, setForm])

    // Filter delivery types based on search query
    const filteredDeliveryTypes = availableDeliveryTypes
        .filter(dt => dt.isActive)
        // For print products like custom 3D print, hide the default digital download option
        .filter(dt => form.productType === 'print' ? dt.name !== 'digital' : true)
        .filter(dt => {
            if (!searchQuery.trim()) return true
            const query = searchQuery.toLowerCase()
            return (
                dt.displayName.toLowerCase().includes(query) ||
                dt.name.toLowerCase().includes(query) ||
                dt.description?.toLowerCase().includes(query)
            )
        })

    // Get recommended delivery types (first 3 applicable ones)
    const getRecommendedDeliveryTypes = () => {
        return availableDeliveryTypes
            .filter(dt => dt.isActive)
            // For print products, never recommend digital delivery
            .filter(dt => form.productType === 'print' ? dt.name !== 'digital' : true)
            .filter(dt => {
                const applicability = getDeliveryTypeApplicability(dt)
                return applicability.applicable
            })
            .slice(0, 3)
    }

    const recommendedTypes = getRecommendedDeliveryTypes()

    const deliveryMissing = missingFields.includes('deliveryTypes')

    return (
        <div className="flex flex-col gap-2 w-full">
                        {!hideDimensions && (
                <div className="border border-borderColor rounded-lg overflow-hidden transition-all duration-200 hover:border-extraLight w-full">
                    <button
                        type="button"
                        onClick={() => setExpandedDimensions(!expandedDimensions)}
                        className="w-full p-4 flex items-center justify-between bg-background hover:bg-extraLight/5 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <RxDimensions className="text-textColor text-xl" />
                            <div className="text-left">
                                <h3 className="font-medium text-sm text-textColor">Product Dimensions</h3>
                                <p className="text-xs text-extraLight mt-0.5">
                                    {(() => {
                                        const dims = form?.dimensions || {}
                                        const hasAny =
                                            (typeof dims.length === 'number' && dims.length > 0) ||
                                            (typeof dims.width === 'number' && dims.width > 0) ||
                                            (typeof dims.height === 'number' && dims.height > 0) ||
                                            (typeof dims.weight === 'number' && dims.weight > 0)
                                        return hasAny
                                            ? `${dims.length || 0}×${dims.width || 0}×${dims.height || 0} cm, ${dims.weight || 0} kg`
                                            : 'Required for delivery types with pricing tiers'
                                    })()}
                                </p>
                            </div>
                        </div>
                        {expandedDimensions ? (
                            <MdExpandLess className="text-xl text-lightColor transition-transform" />
                        ) : (
                            <MdExpandMore className="text-xl text-lightColor transition-transform" />
                        )}
                    </button>

                    {expandedDimensions && (
                        <div className="p-4 border-t border-borderColor bg-baseColor animate-slideDown">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="length" className="text-xs font-medium text-lightColor flex items-center gap-1">
                                        <IoMdCube className="text-sm" />
                                        Length (cm)
                                    </label>
                                    <input
                                        id="length"
                                        name="length"
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        onChange={handleChange}
                                        value={(form.dimensions && form.dimensions.length) ?? ''}
                                        className="formInput text-sm"
                                        placeholder="0.00"
                                        disabled={hasDigitalDelivery}
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="width" className="text-xs font-medium text-lightColor flex items-center gap-1">
                                        <IoMdCube className="text-sm" />
                                        Width (cm)
                                    </label>
                                    <input
                                        id="width"
                                        name="width"
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        onChange={handleChange}
                                        value={(form.dimensions && form.dimensions.width) ?? ''}
                                        className="formInput text-sm"
                                        placeholder="0.00"
                                        disabled={hasDigitalDelivery}
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="height" className="text-xs font-medium text-lightColor flex items-center gap-1">
                                        <IoMdCube className="text-sm" />
                                        Height (cm)
                                    </label>
                                    <input
                                        id="height"
                                        name="height"
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        onChange={handleChange}
                                        value={(form.dimensions && form.dimensions.height) ?? ''}
                                        className="formInput text-sm"
                                        placeholder="0.00"
                                        disabled={hasDigitalDelivery}
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="weight" className="text-xs font-medium text-lightColor flex items-center gap-1">
                                        <FiPackage className="text-sm" />
                                        Weight (kg)
                                    </label>
                                    <input
                                        id="weight"
                                        name="weight"
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        onChange={handleChange}
                                        value={(form.dimensions && form.dimensions.weight) ?? ''}
                                        className="formInput text-sm"
                                        placeholder="0.00"
                                        disabled={hasDigitalDelivery}
                                    />
                                </div>
                            </div>
                            <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded flex gap-2 items-center justify-start text-xs font-medium text-blue-950">
                                <MdOutlineLightbulb />
                                <span>
                                    {hasDigitalDelivery
                                        ? 'Dimensions are not required for digital-only products. Physical shipping methods are disabled while digital delivery is selected.'
                                        : 'Accurate dimensions can help calculate delivery prices automatically for certain delivery types.'}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="border border-borderColor rounded-lg overflow-hidden transition-all duration-200 hover:border-extraLight w-full">
                <button
                    type="button"
                    onClick={() => setExpandedDelivery(!expandedDelivery)}
                    className="w-full p-4 flex items-center justify-between bg-background hover:bg-extraLight/5 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <FiTruck className="text-textColor text-xl" />
                        <div className="text-left">
                            <h3 className="font-medium text-sm text-textColor">Delivery Options</h3>
                            <p className="text-xs text-extraLight mt-0.5">
                                {Object.keys(selectedDeliveryTypes).length > 0
                                    ? `${Object.keys(selectedDeliveryTypes).length} delivery ${Object.keys(selectedDeliveryTypes).length === 1 ? 'type' : 'types'} selected${hasDigitalDelivery ? ' (digital only)' : ''}`
                                    : hasDigitalDelivery
                                        ? 'Digital delivery only. Physical shipping is disabled for this product.'
                                        : 'Select delivery methods for this product'}
                            </p>
                        </div>
                    </div>
                    {expandedDelivery ? (
                        <MdExpandLess className="text-xl text-lightColor transition-transform" />
                    ) : (
                        <MdExpandMore className="text-xl text-lightColor transition-transform" />
                    )}
                </button>

                {expandedDelivery && (
                    <div className="p-4 border-t border-borderColor bg-baseColor animate-slideDown">
                        {deliveryMissing && (
                            <div className="mb-3">
                                <FieldErrorBanner
                                    title="Delivery option required"
                                    message="Select at least one delivery type so customers can receive this product. For downloadable files, digital delivery is required."
                                />
                            </div>
                        )}
                        {loadingDeliveryTypes ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="loader"></div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {hasDigitalDelivery && (
                                    <div className="p-3 bg-blue-50 border border-blue-200 rounded flex gap-2 items-start text-xs text-blue-950">
                                        <MdOutlineLightbulb className="shrink-0 mt-0.5" />
                                        <div className="flex flex-col gap-1">
                                            <p className="font-semibold">Digital Delivery Only</p>
                                            <p>Paid assets (downloadable files) can only be delivered to customers as online products. Physical shipping options, product dimensions, and multiple variants are disabled for digital-only products.</p>
                                        </div>
                                    </div>
                                )}

                                {/* Search Bar */}
                                <div className="relative">
                                    <FiSearch className="absolute right-3 top-1/2 -translate-y-1/2 text-lightColor" />
                                    <input
                                        type="text"
                                        placeholder="Search delivery types..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="formInput text-sm pl-10 pr-4"
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-extraLight hover:text-textColor transition-colors"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                {/* Recommended Delivery Types */}
                                {!searchQuery && recommendedTypes.length > 0 && !hasDigitalDelivery && (
                                    <div className="space-y-2">

                                        <div className="flex flex-wrap gap-2">
                                            {recommendedTypes.map((deliveryType) => {
                                                const isSelected = selectedDeliveryTypes[deliveryType.name]?.enabled
                                                return (
                                                    <button
                                                        key={deliveryType.name}
                                                        type="button"
                                                        onClick={() => !isSelected && toggleDeliveryType(deliveryType)}
                                                        disabled={isSelected}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isSelected
                                                            ? 'bg-textColor text-white cursor-default'
                                                            : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 hover:border-purple-300'
                                                            }`}
                                                    >
                                                        {isSelected ? '✓ ' : '+ '}
                                                        {deliveryType.displayName}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {searchQuery && (
                                    <div className="text-xs text-lightColor">
                                        {filteredDeliveryTypes.length === 0 ? (
                                            <p>No delivery types found matching "{searchQuery}"</p>
                                        ) : (
                                            <p>
                                                Found {filteredDeliveryTypes.length} delivery {filteredDeliveryTypes.length === 1 ? 'type' : 'types'}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Delivery Type Cards */}
                                <div className="space-y-3">
                                    {filteredDeliveryTypes.map((deliveryType) => {
                                        const applicability = getDeliveryTypeApplicability(deliveryType)
                                        const isSelected = selectedDeliveryTypes[deliveryType.name]?.enabled
                                        const isDisabled = !applicability.applicable || (hasDigitalDelivery && deliveryType.name !== 'digital')

                                        return (
                                            <div
                                                key={deliveryType.name}
                                                className={`border rounded-lg transition-all duration-200 ${isSelected
                                                    ? 'border-borderColor bg-white shadow-sm'
                                                    : isDisabled
                                                        ? 'border-borderColor bg-borderColor/10 opacity-50'
                                                        : 'border-borderColor hover:border-extraLight bg-white hover:shadow-sm'
                                                    }`}
                                            >
                                                {/* Header - Checkbox and Name */}
                                                <label
                                                    className={`flex items-start gap-3 p-4 ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                                                        }`}
                                                >
                                                    <div className="flex items-center pt-0.5">
                                                        {isSelected ? (
                                                            <MdCheckCircle
                                                                className={`text-2xl ${isDisabled ? 'text-extraLight' : 'text-textColor'}`}
                                                            />
                                                        ) : (
                                                            <MdRadioButtonUnchecked
                                                                className={`text-2xl ${isDisabled ? 'text-extraLight' : 'text-lightColor'}`}
                                                            />
                                                        )}
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected || false}
                                                            onChange={() => !isDisabled && toggleDeliveryType(deliveryType)}
                                                            disabled={isDisabled}
                                                            className="sr-only"
                                                        />
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`font-medium text-sm ${isDisabled ? 'text-extraLight' : 'text-textColor'
                                                                }`}>
                                                                {deliveryType.displayName}
                                                            </span>
                                                        </div>

                                                        {/* Status badges */}
                                                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                            {deliveryType.isHardcoded && (
                                                                <span className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">
                                                                    Default
                                                                </span>
                                                            )}
                                                            {applicability.defaultPrice != null && (
                                                                <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-full font-semibold">
                                                                    ${applicability.defaultPrice.toFixed(2)}
                                                                </span>
                                                            )}
                                                            {deliveryType.name === 'digital' && (
                                                                <span className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">
                                                                    Free
                                                                </span>
                                                            )}
                                                            {applicability.defaultPrice == null && !isDisabled && deliveryType.pricingTiers?.length === 0 && deliveryType.name !== 'digital' && (
                                                                <span className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded-full font-medium">
                                                                    Custom pricing
                                                                </span>
                                                            )}
                                                            {applicability.reason && (
                                                                <span className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded-full font-medium">
                                                                    {applicability.reason}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Description */}
                                                        {deliveryType.description && (
                                                            <p className="text-xs text-lightColor mt-2 leading-relaxed">
                                                                {deliveryType.description}
                                                            </p>
                                                        )}

                                                        {/* Tier matched info */}
                                                        {applicability.tierMatched && isSelected && (
                                                            <div className="mt-3 p-2.5 bg-green-50 border border-green-200 rounded text-xs">
                                                                <span className="text-green-600 font-medium">✓ Matched tier: </span>
                                                                <span className="text-green-700">
                                                                    {applicability.tierMatched.volumeRange}, {applicability.tierMatched.weightRange}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </label>

                                                {/* Expandable Custom Price and Description */}
                                                {isSelected && deliveryType.name !== 'digital' && (
                                                    <div className="px-4 pb-4 pl-16 space-y-4 border-t border-borderColor pt-4 bg-baseColor/50 animate-slideDown">
                                                        {/* Custom Price (optional, can be hidden e.g. for custom print config) */}
                                                        {!hidePriceEditor && (
                                                            <div className="space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <label className="text-xs font-semibold text-textColor uppercase tracking-wide">
                                                                        Delivery Price
                                                                    </label>
                                                                    {selectedDeliveryTypes[deliveryType.name]?.defaultPrice != null &&
                                                                        selectedDeliveryTypes[deliveryType.name]?.customPrice !== selectedDeliveryTypes[deliveryType.name]?.defaultPrice && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => resetToDefaultPrice(deliveryType.name)}
                                                                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors font-medium"
                                                                            >
                                                                                <BiReset className="text-sm" />
                                                                                Reset
                                                                            </button>
                                                                        )}
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-lightColor text-sm font-medium">$</span>
                                                                    <input
                                                                        type="number"
                                                                        min={0}
                                                                        step="0.01"
                                                                        value={selectedDeliveryTypes[deliveryType.name]?.customPrice ?? ''}
                                                                        onChange={(e) => updateCustomPrice(deliveryType.name, e.target.value)}
                                                                        placeholder={applicability.defaultPrice != null ? applicability.defaultPrice.toFixed(2) : '0.00'}
                                                                        className="formInput text-sm font-medium flex-1"
                                                                    />
                                                                </div>
                                                                <p className="text-xs text-extraLight leading-relaxed">
                                                                    {deliveryType.basePricing && applicability.defaultPrice != null
                                                                        ? 'You can override the automatically calculated price (formula-based)'
                                                                        : deliveryType.pricingTiers?.length > 0 && applicability.defaultPrice != null
                                                                            ? 'You can override the automatically calculated price (tier-based)'
                                                                            : 'Set your delivery price for this option'}
                                                                </p>
                                                            </div>
                                                        )}

                                                        {/* Custom Description */}
                                                        <div className="space-y-2">
                                                            <label className="text-xs font-semibold text-textColor uppercase tracking-wide">
                                                                Additional Information
                                                            </label>
                                                            <textarea
                                                                value={selectedDeliveryTypes[deliveryType.name]?.customDescription ?? ''}
                                                                onChange={(e) => updateCustomDescription(deliveryType.name, e.target.value)}
                                                                placeholder="E.g., Pickup at 123 Main St, Mon-Fri 9AM-5PM&#10;Estimated delivery: 3-5 business days&#10;Free delivery for orders over $50"
                                                                className="formInput text-sm resize-none leading-relaxed"
                                                                rows={3}
                                                            />
                                                            <p className="text-xs text-extraLight leading-relaxed">
                                                                This will be shown to customers at checkout
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Digital delivery - show informational message */}
                                                {isSelected && deliveryType.name === 'digital' && (
                                                    <div className="px-4 pb-4 border-t border-borderColor pt-4 bg-blue-50/50 animate-slideDown">
                                                        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded justify-start text-xs font-medium text-blue-950">

                                                            <MdOutlineLightbulb size={16} />

                                                            <div className="flex flex-col gap-1.5">
                                                                <p className="font-semibold">Digital products are delivered online only</p>
                                                                <p className="font-normal">Customers receive instant access to download files after purchase. No shipping fees apply. Physical delivery options and product dimensions are not required for digital-only products.</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}

                                    {filteredDeliveryTypes.length === 0 && searchQuery && (
                                        <div className="text-center py-12 border-2 border-dashed border-borderColor rounded-lg bg-extraLight/5">
                                            <FiSearch className="text-4xl text-extraLight mx-auto mb-3" />
                                            <p className="text-sm text-lightColor font-medium">No results found</p>
                                            <p className="text-xs text-extraLight mt-1">Try adjusting your search</p>
                                        </div>
                                    )}

                                    {availableDeliveryTypes.filter(dt => dt.isActive).length === 0 && (
                                        <div className="text-center py-12 border-2 border-dashed border-borderColor rounded-lg bg-extraLight/5">
                                            <FiTruck className="text-4xl text-extraLight mx-auto mb-3" />
                                            <p className="text-sm text-lightColor font-medium">No delivery types available</p>
                                            <p className="text-xs text-extraLight mt-1">Contact admin to add delivery options</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

        </div>
    )
}
