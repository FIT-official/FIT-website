import React, { useState, useEffect, useRef } from 'react'
import { useAdminSettings } from '@/utils/AdminSettingsContext';
import { getDeliveryTypeApplicability as getDeliveryTypeApplicabilityHelper, toggleDeliveryType as toggleDeliveryTypeHelper, updateCustomPrice as updateCustomPriceHelper, updateCustomDescription as updateCustomDescriptionHelper, resetToDefaultPrice as resetToDefaultPriceHelper } from '@/utils/deliveryTypeHelpers'
import { MdCheckCircle, MdRadioButtonUnchecked } from 'react-icons/md'
import { FiTruck, FiSearch } from 'react-icons/fi'
import { BiReset } from 'react-icons/bi'
import FieldErrorBanner from './FieldErrorBanner'
import { InfoStrip, inputCls, labelCls } from './dashFormUi'

export default function ShippingFields({ form, handleChange, setForm, hideDimensions, hidePriceEditor, missingFields = [], availableDeliveryTypes: propAvailableDeliveryTypes }) {
    const [availableDeliveryTypes, setAvailableDeliveryTypes] = useState([])
    const [loadingDeliveryTypes, setLoadingDeliveryTypes] = useState(true)
    const [selectedDeliveryTypes, setSelectedDeliveryTypes] = useState({})
    const [initialized, setInitialized] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const seededRef = useRef(false)

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
        const savedTypes = form.delivery?.deliveryTypes || []
        // In edit mode the product loads async, so `form.delivery` is empty on the
        // first pass. Don't lock initialization on that empty pass — wait for the
        // saved types to arrive, then seed from them. (Create mode flips
        // `initialized` on the first user toggle, in toggleDeliveryType.)
        if (savedTypes.length === 0) return;
        const selected = {}
        savedTypes.forEach(dt => {
            selected[dt.type] = {
                enabled: true,
                customPrice: dt.customPrice ?? dt.price ?? null,
                customDescription: dt.customDescription ?? '',
                defaultPrice: dt.price ?? null
            }
        })
        seededRef.current = selected
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

    // Push local selection → form whenever the USER changes it. Depends only on
    // `selectedDeliveryTypes` (not `form.delivery`): the comparison reads `prev`
    // inside the updater, so an async product load filling `form.delivery` can no
    // longer re-trigger this effect with a stale-empty selection and wipe the
    // saved types. (The init effect above seeds the selection from the load.)
    useEffect(() => {
        // The sync triggered by the init seeding itself would rewrite the
        // saved entries in normalized form (pinning `customPrice`, nulling
        // descriptions) even though the user changed nothing — skip exactly
        // that one run so an untouched form round-trips byte-identical.
        if (seededRef.current) {
            // The initial effect can run before the queued selection update.
            // Keep the seed marker until that exact selection has rendered.
            if (seededRef.current === selectedDeliveryTypes) seededRef.current = false
            return
        }
        const deliveryTypes = Object.entries(selectedDeliveryTypes)
            .filter(([_, data]) => data.enabled)
            .map(([type, data]) => ({
                type,
                price: data.customPrice ?? data.defaultPrice ?? 0,
                customPrice: data.customPrice,
                customDescription: data.customDescription || null
            }))

        setForm(prev => {
            const currentTypes = prev.delivery?.deliveryTypes || []
            if (JSON.stringify(currentTypes) === JSON.stringify(deliveryTypes)) return prev
            return { ...prev, delivery: { ...prev.delivery, deliveryTypes } }
        })
    }, [selectedDeliveryTypes, setForm])

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

    const DIMENSION_FIELDS = [
        ['length', 'Length (cm)'],
        ['width', 'Width (cm)'],
        ['height', 'Height (cm)'],
        ['weight', 'Weight (kg)'],
    ]

    return (
        <div className="flex flex-col gap-6 w-full">
            {!hideDimensions && (
                <div className="w-full space-y-3">
                    <span className={labelCls}>Product Dimensions</span>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {DIMENSION_FIELDS.map(([name, label]) => (
                            <div key={name} className="flex flex-col gap-1.5">
                                <label htmlFor={name} className={labelCls}>
                                    {label}
                                </label>
                                <input
                                    id={name}
                                    name={name}
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    onChange={handleChange}
                                    value={(form.dimensions && form.dimensions[name]) ?? ''}
                                    className={`${inputCls()} dash-data`}
                                    placeholder="0.00"
                                    disabled={hasDigitalDelivery}
                                />
                            </div>
                        ))}
                    </div>
                    <InfoStrip tone="info">
                        {hasDigitalDelivery
                            ? 'Dimensions are not required for digital-only products. Physical shipping methods are disabled while digital delivery is selected.'
                            : 'Accurate dimensions can help calculate delivery prices automatically for certain delivery types.'}
                    </InfoStrip>
                </div>
            )}

            <div className="w-full space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                    <span className={labelCls}>Delivery Options</span>
                    <span className="text-[13px] text-[var(--dash-ink-soft)]">
                        {Object.keys(selectedDeliveryTypes).length > 0
                            ? `${Object.keys(selectedDeliveryTypes).length} selected${hasDigitalDelivery ? ' (digital only)' : ''}`
                            : hasDigitalDelivery
                                ? 'Digital delivery only'
                                : ''}
                    </span>
                </div>

                {deliveryMissing && (
                    <FieldErrorBanner
                        title="Delivery option required"
                        message="Select at least one delivery type so customers can receive this product. For downloadable files, digital delivery is required."
                    />
                )}
                {loadingDeliveryTypes ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="loader"></div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {hasDigitalDelivery && (
                            <InfoStrip tone="info" title="Digital Delivery Only">
                                <p>Paid assets (downloadable files) can only be delivered to customers as online products. Physical shipping options, product dimensions, and multiple variants are disabled for digital-only products.</p>
                            </InfoStrip>
                        )}

                        {/* Search Bar */}
                        <div className="relative">
                            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dash-ink-soft)]" aria-hidden="true" />
                            <input
                                type="text"
                                placeholder="Search delivery types..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className={`${inputCls()} pl-9 pr-8`}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    aria-label="Clear delivery search"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--dash-ink-soft)] hover:text-[var(--dash-ink)] cursor-pointer"
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
                                                className={`dash-hoverable px-3 py-1.5 rounded-full text-[13px] font-medium ${isSelected
                                                    ? 'bg-[var(--dash-sun-soft)] text-[var(--dash-ink)] cursor-default border border-[var(--dash-line)]'
                                                    : 'bg-[var(--dash-card)] text-[var(--dash-ink)] border border-[var(--dash-line)] hover:bg-[var(--dash-canvas)] cursor-pointer'
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
                            <div className="text-[13px] text-[var(--dash-ink-soft)]">
                                {filteredDeliveryTypes.length === 0 ? (
                                    <p>No delivery types found matching &quot;{searchQuery}&quot;</p>
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
                                        className={`border border-[var(--dash-line)] rounded-[var(--dash-r-inner)] dash-hoverable ${isSelected
                                            ? 'bg-[var(--dash-card)] shadow-[var(--dash-shadow-card)]'
                                            : isDisabled
                                                ? 'bg-[var(--dash-canvas)] opacity-50'
                                                : 'bg-[var(--dash-card)] hover:shadow-[var(--dash-shadow-card)]'
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
                                                        className={`text-xl ${isDisabled ? 'text-[var(--dash-ink-faint)]' : 'text-[var(--dash-ink)]'}`}
                                                    />
                                                ) : (
                                                    <MdRadioButtonUnchecked
                                                        className={`text-xl ${isDisabled ? 'text-[var(--dash-ink-faint)]' : 'text-[var(--dash-ink-soft)]'}`}
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
                                                    <span className={`font-medium text-[13px] ${isDisabled ? 'text-[var(--dash-ink-soft)]' : 'text-[var(--dash-ink)]'
                                                        }`}>
                                                        {deliveryType.displayName}
                                                    </span>
                                                </div>

                                                {/* Status badges */}
                                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                    {deliveryType.isHardcoded && (
                                                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] text-[var(--dash-ink-soft)]">
                                                            Default
                                                        </span>
                                                    )}
                                                    {applicability.defaultPrice != null && (
                                                        <span className="dash-data px-2 py-0.5 rounded-full bg-[var(--dash-ok-bg)] text-[var(--dash-ok)]">
                                                            ${applicability.defaultPrice.toFixed(2)}
                                                        </span>
                                                    )}
                                                    {deliveryType.name === 'digital' && (
                                                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--dash-ok-bg)] text-[var(--dash-ok)]">
                                                            Free
                                                        </span>
                                                    )}
                                                    {applicability.defaultPrice == null && !isDisabled && deliveryType.pricingTiers?.length === 0 && deliveryType.name !== 'digital' && (
                                                        <span className="dash-hatch text-[11px] font-medium px-2 py-0.5 rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] text-[var(--dash-ink)]">
                                                            Custom pricing
                                                        </span>
                                                    )}
                                                    {applicability.reason && (
                                                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--dash-bad-bg)] text-[var(--dash-bad)]">
                                                            {applicability.reason}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Description */}
                                                {deliveryType.description && (
                                                    <p className="text-[13px] text-[var(--dash-ink-soft)] mt-2 leading-relaxed">
                                                        {deliveryType.description}
                                                    </p>
                                                )}

                                                {/* Tier matched info */}
                                                {applicability.tierMatched && isSelected && (
                                                    <div className="mt-3 px-2.5 py-2 rounded-[var(--dash-r-inner)] bg-[var(--dash-ok-bg)] text-[13px] text-[var(--dash-ok)]">
                                                        <span className="font-medium">✓ Matched tier: </span>
                                                        <span>
                                                            {applicability.tierMatched.volumeRange}, {applicability.tierMatched.weightRange}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </label>

                                        {/* Expandable Custom Price and Description */}
                                        {isSelected && deliveryType.name !== 'digital' && (
                                            <div className="px-4 pb-4 md:pl-12 space-y-4 border-t border-[var(--dash-line)] pt-4">
                                                {/* Custom Price (optional, can be hidden e.g. for custom print config) */}
                                                {!hidePriceEditor && (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <label className={labelCls}>
                                                                Delivery Price
                                                            </label>
                                                            {selectedDeliveryTypes[deliveryType.name]?.defaultPrice != null &&
                                                                selectedDeliveryTypes[deliveryType.name]?.customPrice !== selectedDeliveryTypes[deliveryType.name]?.defaultPrice && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => resetToDefaultPrice(deliveryType.name)}
                                                                        className="flex items-center gap-1 text-[13px] font-medium text-[var(--dash-ink-soft)] hover:text-[var(--dash-ink)] cursor-pointer"
                                                                    >
                                                                        <BiReset aria-hidden="true" />
                                                                        Reset
                                                                    </button>
                                                                )}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[var(--dash-ink-soft)] text-[13px]">$</span>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step="0.01"
                                                                value={selectedDeliveryTypes[deliveryType.name]?.customPrice ?? ''}
                                                                onChange={(e) => updateCustomPrice(deliveryType.name, e.target.value)}
                                                                placeholder={applicability.defaultPrice != null ? applicability.defaultPrice.toFixed(2) : '0.00'}
                                                                className={`${inputCls()} dash-data flex-1`}
                                                            />
                                                        </div>
                                                        <p className="text-[13px] text-[var(--dash-ink-soft)] leading-relaxed">
                                                            {deliveryType.basePricing && applicability.defaultPrice != null
                                                                ? 'You can override the automatically calculated price (formula-based)'
                                                                : deliveryType.pricingTiers?.length > 0 && applicability.defaultPrice != null
                                                                    ? 'You can override the automatically calculated price (tier-based)'
                                                                    : 'Set your delivery price for this option'}
                                                        </p>
                                                        {form.productType === 'shop' && deliveryType.name === 'standard-shipping' && (
                                                            <p className="text-[13px] text-[var(--dash-ink-soft)] leading-relaxed">A zero shop delivery rate uses the existing S$6.20 fallback. Positive delivery rates and collection prices are unchanged.</p>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Custom Description */}
                                                <div className="space-y-2">
                                                    <label className={labelCls}>
                                                        Additional Information
                                                    </label>
                                                    <textarea
                                                        value={selectedDeliveryTypes[deliveryType.name]?.customDescription ?? ''}
                                                        onChange={(e) => updateCustomDescription(deliveryType.name, e.target.value)}
                                                        placeholder="E.g., Pickup at 123 Main St, Mon-Fri 9AM-5PM&#10;Estimated delivery: tracked, next working day"
                                                        className={`${inputCls()} resize-none leading-relaxed`}
                                                        rows={3}
                                                    />
                                                    <p className="text-[13px] text-[var(--dash-ink-soft)] leading-relaxed">
                                                        This will be shown to customers at checkout
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Digital delivery - show informational message */}
                                        {isSelected && deliveryType.name === 'digital' && (
                                            <div className="px-4 pb-4 border-t border-[var(--dash-line)] pt-4">
                                                <InfoStrip tone="info" title="Digital products are delivered online only">
                                                    <p>Customers receive instant access to download files after purchase. No shipping fees apply. Physical delivery options and product dimensions are not required for digital-only products.</p>
                                                </InfoStrip>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}

                            {filteredDeliveryTypes.length === 0 && searchQuery && (
                                <div className="text-center py-12 border border-dashed border-[var(--dash-line)] rounded-[var(--dash-r-inner)]">
                                    <FiSearch className="text-3xl text-[var(--dash-ink-soft)] mx-auto mb-3" aria-hidden="true" />
                                    <p className="text-[13px] font-medium">No results found</p>
                                    <p className="text-[13px] text-[var(--dash-ink-soft)] mt-1">Try adjusting your search</p>
                                </div>
                            )}

                            {availableDeliveryTypes.filter(dt => dt.isActive).length === 0 && (
                                <div className="text-center py-12 border border-dashed border-[var(--dash-line)] rounded-[var(--dash-r-inner)]">
                                    <FiTruck className="text-3xl text-[var(--dash-ink-soft)] mx-auto mb-3" aria-hidden="true" />
                                    <p className="text-[13px] font-medium">No delivery types available</p>
                                    <p className="text-[13px] text-[var(--dash-ink-soft)] mt-1">Contact admin to add delivery options</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
