// deliveryTypeHelpers.js
// Reusable helpers for delivery type pricing logic
import { calculateDeliveryPrice, isDeliveryTypeApplicable } from '@/utils/deliveryPriceCalculator'

/**
 * Returns applicability and price info for a delivery type given product form and dimensions.
 * Supports formula-based (basePricing) and tier-based (pricingTiers) pricing models.
 */
export function getDeliveryTypeApplicability(deliveryType, form) {
    // For print products (including custom 3D prints), digital delivery must never be selectable or recommended
    if (form.productType === 'print' && deliveryType.name === 'digital') {
        return {
            applicable: false,
            reason: 'Digital delivery is not available for printed products'
        }
    }

    if (!isDeliveryTypeApplicable(deliveryType, form.productType)) {
        return {
            applicable: false,
            reason: `Not applicable to ${form.productType} products`
        }
    }

    // Check if product has dimensions set
    const dims = form?.dimensions || {}
    // Coerce all dimension values to numbers for robust checking
    const length = Number(dims.length)
    const width = Number(dims.width)
    const height = Number(dims.height)
    const weight = Number(dims.weight)
    const hasDimensions =
        !isNaN(length) && length > 0 &&
        !isNaN(width) && width > 0 &&
        !isNaN(height) && height > 0 &&
        !isNaN(weight) && weight > 0

    // Formula-based pricing (basePricing)
    if (deliveryType.basePricing && deliveryType.basePricing.basePrice != null) {
        if (!hasDimensions) {
            return {
                applicable: false,
                reason: 'Enter product dimensions first'
            }
        }
        // Calculate price using formula: basePrice + (volume * volumeFactor) + (weight * weightFactor)
        const base = Number(deliveryType.basePricing.basePrice) || 0;
        const volumeFactor = Number(deliveryType.basePricing.volumeFactor) || 0;
        const weightFactor = Number(deliveryType.basePricing.weightFactor) || 0;
        const minPrice = deliveryType.basePricing.minPrice != null ? Number(deliveryType.basePricing.minPrice) : null;
        const maxPrice = deliveryType.basePricing.maxPrice != null ? Number(deliveryType.basePricing.maxPrice) : null;
        const volume = length * width * height;
        const weightGrams = weight * 1000; // weight is in kg, convert to grams
        let price = base + (volume * volumeFactor) + (weightGrams * weightFactor);
        if (minPrice !== null && price < minPrice) price = minPrice;
        if (maxPrice !== null && price > maxPrice) price = maxPrice;
        return {
            applicable: true,
            defaultPrice: price,
            formulaUsed: true,
            reason: null
        }
    }

    // Tier-based pricing (pricingTiers)
    if (deliveryType.pricingTiers && deliveryType.pricingTiers.length > 0) {
        if (!hasDimensions) {
            return {
                applicable: false,
                reason: 'Enter product dimensions first'
            }
        }
        const dimensions = {
            length: Number(dims.length) || 0,
            width: Number(dims.width) || 0,
            height: Number(dims.height) || 0,
            weight: (Number(dims.weight) || 0) * 1000 // Convert kg to grams
        }
        const priceCalc = calculateDeliveryPrice(deliveryType, dimensions)
        return {
            applicable: priceCalc.applicable,
            defaultPrice: priceCalc.price,
            tierMatched: priceCalc.tierMatched,
            reason: !priceCalc.applicable ? 'Product dimensions exceed allowed range' : null
        }
    }

    return {
        applicable: true,
        defaultPrice: null,
        reason: null
    }
}

/**
 * Returns a new selectedDeliveryTypes object with the toggled delivery type.
 * Handles digital/physical exclusivity and default price calculation.
 */
export function toggleDeliveryType({
    deliveryType,
    form,
    selectedDeliveryTypes,
    setSelectedDeliveryTypes,
    setForm,
    initialized,
    setInitialized,
    getDeliveryTypeApplicabilityImpl = getDeliveryTypeApplicability
}) {
    if (!initialized) setInitialized(true)
    if (form.productType === 'print' && deliveryType.name === 'digital') return

    const typeName = deliveryType.name
    const isCurrentlySelected = selectedDeliveryTypes[typeName]?.enabled
    const hasDigitalDelivery = form.delivery?.deliveryTypes?.some(dt => dt.type === 'digital' || dt === 'digital')
    if (hasDigitalDelivery && deliveryType.name !== 'digital') return
    if (deliveryType.name === 'digital' && !isCurrentlySelected) {
        const otherTypesSelected = Object.keys(selectedDeliveryTypes).some(key => key !== 'digital' && selectedDeliveryTypes[key]?.enabled)
        if (otherTypesSelected) {
            setSelectedDeliveryTypes({
                digital: {
                    enabled: true,
                    customPrice: 0,
                    customDescription: 'Digital download only',
                    defaultPrice: 0
                }
            })
            setForm(prev => ({ ...prev, variantTypes: [], dimensions: {} })) // Clear dimensions when digital is selected
            return
        }
    }
    if (isCurrentlySelected) {
        const newSelected = { ...selectedDeliveryTypes }
        delete newSelected[typeName]
        setSelectedDeliveryTypes(newSelected)
    } else {
        const applicability = getDeliveryTypeApplicabilityImpl(deliveryType, form)
        setSelectedDeliveryTypes({
            ...selectedDeliveryTypes,
            [typeName]: {
                enabled: true,
                customPrice: applicability.defaultPrice,
                customDescription: deliveryType.description || '',
                defaultPrice: applicability.defaultPrice
            }
        })
        if (typeName === 'digital') {
            setForm(prev => ({ ...prev, variantTypes: [], dimensions: {} })) // Clear dimensions when digital is selected
        }
    }
}

/**
 * Returns a new selectedDeliveryTypes object with updated custom price.
 */
export function updateCustomPrice(selectedDeliveryTypes, typeName, price) {
    return {
        ...selectedDeliveryTypes,
        [typeName]: {
            ...selectedDeliveryTypes[typeName],
            customPrice: price === '' ? null : Number(price)
        }
    }
}

/**
 * Returns a new selectedDeliveryTypes object with updated custom description.
 */
export function updateCustomDescription(selectedDeliveryTypes, typeName, description) {
    return {
        ...selectedDeliveryTypes,
        [typeName]: {
            ...selectedDeliveryTypes[typeName],
            customDescription: description
        }
    }
}

/**
 * Returns a new selectedDeliveryTypes object with the custom price reset to default.
 */
export function resetToDefaultPrice(selectedDeliveryTypes, typeName) {
    if (selectedDeliveryTypes[typeName]?.defaultPrice != null) {
        return {
            ...selectedDeliveryTypes,
            [typeName]: {
                ...selectedDeliveryTypes[typeName],
                customPrice: selectedDeliveryTypes[typeName].defaultPrice
            }
        }
    }
    return selectedDeliveryTypes
}
