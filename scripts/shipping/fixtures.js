// Public names and base prices from PRODUCT_WEIGHTS_2026-10-10.csv.
// Synthetic guest carts; no private costs or account data.
export const fixtureProducts = {
    sensor: { slug: 'hcsr04-ultrasonic-sensor', name: 'HCSR04 Ultrasonic Sensor', price: 1.65 },
    filament: { slug: 'bambu-lab-3d-printing-filament-1kg-pla-basic', name: 'Bambu Lab 3D Printing Filament 1kg PLA Basic', price: 21.9 },
    led: { slug: '2pin-white-led', name: '2PIN White LED', price: 22 },
};

export const fixtureCases = {
    'small-item': { lines: [['sensor', 1]], expectedShippingCents: 200 },
    filament: { lines: [['filament', 1]], expectedShippingCents: 620 },
    mixed: { lines: [['sensor', 1], ['filament', 1]], expectedShippingCents: 620 },
    'over-30': { lines: [['led', 2]], expectedShippingCents: 620 },
    'over-200': { lines: [['led', 10]], expectedShippingCents: 0 },
};

export function shippingFixture(key) {
    const scenario = fixtureCases[key];
    if (!scenario) throw new Error('Unknown shipping fixture');
    const products = scenario.lines.map(([name]) => {
        const source = fixtureProducts[name];
        return { _id: source.slug, slug: source.slug, name: source.name, productType: 'shop', listing: 'fit',
            creatorUserId: 'fixture', images: [], variantTypes: [],
            basePrice: { presentmentAmount: source.price, presentmentCurrency: 'SGD' },
            delivery: { deliveryTypes: [
                { type: 'standard-shipping', price: 6.2 },
                { type: 'express-courier', price: 30 },
                { type: 'pick-up', price: 0 },
            ] } };
    });
    return { products, cart: scenario.lines.map(([, quantity], i) => ({
        _id: `fixture-${i}`, productId: products[i]._id, quantity, chosenDeliveryType: 'standard-shipping', selectedVariants: {},
    })) };
}
