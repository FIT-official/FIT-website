/**
 * Calculate the delivery price based on product dimensions/weight and delivery type pricing tiers
 * @param {Object} deliveryType - The delivery type configuration from AppSettings
 * @param {Object} productDimensions - {length, width, height (in cm), weight (in grams)}
 * @returns {Object} - {applicable: boolean, price: number|null, tierMatched: Object|null}
 */
export function calculateDeliveryPrice(deliveryType, productDimensions) {
    if (!deliveryType || !deliveryType.pricingTiers || deliveryType.pricingTiers.length === 0) {
        // No pricing tiers defined - not automatically applicable
        return { applicable: false, price: null, tierMatched: null };
    }

    const { length = 0, width = 0, height = 0, weight = 0 } = productDimensions;

    // Calculate volume in cm³
    const volume = length * width * height;

    // Find matching tier
    for (const tier of deliveryType.pricingTiers) {
        const volumeMatches = volume >= tier.minVolume && volume <= tier.maxVolume;
        const weightMatches = weight >= tier.minWeight && weight <= tier.maxWeight;

        if (volumeMatches && weightMatches) {
            return {
                applicable: true,
                price: tier.price,
                tierMatched: {
                    volumeRange: `${tier.minVolume}-${tier.maxVolume} cm³`,
                    weightRange: `${tier.minWeight}-${tier.maxWeight}g`,
                    price: tier.price
                }
            };
        }
    }

    // No matching tier found
    return { applicable: false, price: null, tierMatched: null };
}

/**
 * Check if a delivery type is applicable to a product based on product type
 * @param {Object} deliveryType - The delivery type configuration
 * @param {String} productType - "shop" or "print"
 * @returns {boolean}
 */
export function isDeliveryTypeApplicable(deliveryType, productType) {
    if (!deliveryType || !deliveryType.applicableToProductTypes) {
        return false;
    }

    return deliveryType.applicableToProductTypes.includes(productType);
}

/**
 * Get all applicable delivery types for a product
 * @param {Array} deliveryTypes - Array of delivery types from AppSettings
 * @param {String} productType - "shop" or "print"
 * @param {Object} productDimensions - Product dimensions
 * @returns {Array} - Array of {deliveryType, priceCalculation}
 */
export function getApplicableDeliveryTypes(deliveryTypes, productType, productDimensions) {
    return deliveryTypes
        .filter(dt => dt.isActive && isDeliveryTypeApplicable(dt, productType))
        .map(dt => ({
            deliveryType: dt,
            priceCalculation: calculateDeliveryPrice(dt, productDimensions)
        }));
}
