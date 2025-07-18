import { calculateSingpostRate, getDestinationZone } from './singpostRate';
import { getDiscountedPrice } from '@/utils/discount';

export async function calculateCartItemBreakdown({ item, product, address }) {
    const destination = getDestinationZone(address.country);
    const quantity = item.quantity || 1;

    let price = product.price?.presentmentAmount || 0;
    const discounted = getDiscountedPrice(product);
    if (discounted !== null) {
        price = discounted;
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

    const total = (price * quantity) + deliveryFee;

    return {
        name: product.name,
        quantity,
        price,
        chosenDeliveryType: item.chosenDeliveryType,
        royaltyFee,
        singpostFee,
        deliveryFee,
        total
    };
}