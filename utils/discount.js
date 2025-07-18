export function getDiscountedPrice(product) {
    const { discount, price } = product;
    if (
        !discount ||
        !discount.percentage ||
        discount.percentage <= 0 ||
        (discount.startDate && new Date() < new Date(discount.startDate)) ||
        (discount.endDate && new Date() > new Date(discount.endDate)) ||
        (discount.minimumAmount && Number(price.presentmentAmount) < Number(discount.minimumAmount))
    ) {
        return null;
    }
    const discounted = Number(price.presentmentAmount) * (1 - discount.percentage / 100);
    return Number(discounted.toFixed(2));
}