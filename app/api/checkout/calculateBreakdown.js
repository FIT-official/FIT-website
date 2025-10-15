import { calculateSingpostRate, getDestinationZone } from './singpostRate';
import { getDiscountedPrice } from '@/utils/discount';

export async function calculateCartItemBreakdown({ item, product, address }) {
    const destination = getDestinationZone(address.country);
    const quantity = item.quantity || 1;

    let basePrice = 0;
    let priceBeforeDiscount = 0;
    let finalPrice = 0;
    let variantInfo = [];

    // Check if product has variant types with additional fees
    if (product.basePrice && product.variantTypes && product.variantTypes.length > 0) {
        // Product with variant types system (physical products with options)
        basePrice = product.basePrice.presentmentAmount || 0;
        priceBeforeDiscount = basePrice;

        // Add additional fees from selected variants and build variantInfo
        if (item.selectedVariants) {
            // Convert Map to plain object if needed
            const selectedVariantsObj = item.selectedVariants instanceof Map
                ? Object.fromEntries(item.selectedVariants)
                : (typeof item.selectedVariants === 'object' ? item.selectedVariants : {});

            for (const [variantTypeName, selectedOption] of Object.entries(selectedVariantsObj)) {
                const variantType = product.variantTypes.find(vt => vt.name === variantTypeName);
                if (variantType) {
                    const option = variantType.options.find(opt => opt.name === selectedOption);
                    if (option) {
                        priceBeforeDiscount += (option.additionalFee || 0);
                        variantInfo.push({
                            type: variantTypeName,
                            option: selectedOption,
                            additionalFee: option.additionalFee || 0
                        });
                    }
                }
            }
        }

        // Apply discount to price with variants
        const discounted = getDiscountedPrice({ ...product, price: { presentmentAmount: priceBeforeDiscount } });
        finalPrice = discounted !== null ? discounted : priceBeforeDiscount;

    } else if (product.basePrice) {
        // Product with only base price (default variant - typically digital products)
        basePrice = product.basePrice.presentmentAmount || 0;
        priceBeforeDiscount = basePrice;

        // Apply discount if applicable
        const discounted = getDiscountedPrice({ ...product, price: { presentmentAmount: priceBeforeDiscount } });
        finalPrice = discounted !== null ? discounted : priceBeforeDiscount;

    } else {
        // Should not reach here - all products should have basePrice
        throw new Error(`Product ${product._id} missing basePrice`);
    }

    const deliveryTypeObj = (product.delivery?.deliveryTypes || []).find(
        dt => dt.type === item.chosenDeliveryType
    );
    const royaltyFee = deliveryTypeObj?.royaltyFee || 0;

    let deliveryFee = royaltyFee;
    let singpostFee = 0;
    if (item.chosenDeliveryType === "singpost") {
        const weight_kg = product.dimensions?.weight || 0;
        const dimensions_mm = [
            (product.dimensions?.length || 0) * 10,
            (product.dimensions?.width || 0) * 10,
            (product.dimensions?.height || 0) * 10,
        ];
        singpostFee = calculateSingpostRate(destination, weight_kg, dimensions_mm);
        if (singpostFee < 0) singpostFee = 0;
        deliveryFee += singpostFee;
    }

    const total = (finalPrice * quantity) + deliveryFee;

    return {
        productId: product._id.toString(),
        selectedVariants: item.selectedVariants || {},
        name: product.name,
        quantity,
        price: finalPrice, // Final price after discount
        priceBeforeDiscount, // Price with variants but before discount
        basePrice, // Base price without variants/options
        variantInfo, // Array of variant selections with fees (empty for default variant products)
        chosenDeliveryType: item.chosenDeliveryType,
        royaltyFee,
        singpostFee,
        deliveryFee,
        total,
        creatorUserId: product.creatorUserId,
        currency: product.basePrice?.presentmentCurrency || 'SGD',
    };
}