// Repair only the verified legacy PLA Basic display labels. Keep stored names
// as selection/cart keys so existing order and price matching is unchanged.
export function productVariantLabel(product, type) {
  if (product?.slug !== 'bambu-lab-3d-printing-filament-1kg-pla-basic' || !type?.options?.length) return type?.name
  if (type.name === 'Spool' && type.options.every(option => /\(\d{5}\)$/.test(option.name))) return 'Colour'
  if (type.name === 'Colour' && type.options.every(option => /^(?:With|Without) Spool$/.test(option.name))) return 'Spool'
  return type.name
}

// Manufacturer code 10802 is Cocoa Brown. Keep the legacy inventory name as
// the option value so price, stock, photo evidence and cart joins still match.
export function productVariantOptionLabel(product, option) {
  return product?.slug === 'bambu-lab-3d-printing-filament-1kg-pla-basic' && option?.name === 'Coca Brown (10802)'
    ? 'Cocoa Brown (10802)'
    : option?.name
}
