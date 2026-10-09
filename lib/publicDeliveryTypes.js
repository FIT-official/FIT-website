// Only metadata used by customers. Pricing and internal settings stay server-side.
export function publicDeliveryTypes(settings) {
    const types = [
        { name: 'digital', displayName: 'Digital Download', description: 'Instant download after purchase', isActive: true },
        ...(settings?.additionalDeliveryTypes || []),
    ];
    return types.filter(type => type.isActive === true).map(type => ({
        name: type.name,
        displayName: type.displayName,
        description: type.description || '',
    }));
}
