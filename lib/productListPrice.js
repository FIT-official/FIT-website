// The product page and bulk enquiries share the undiscounted variant price.
export function productListPrice(product, selectedOptions) {
  const base = product.basePrice?.presentmentAmount || 0
  const additional = (product.variantTypes || []).reduce((sum, type) => {
    const option = type.options.find(o => o.name === selectedOptions[type.name])
    return sum + (option?.additionalFee || 0)
  }, 0)
  return { base, additional, total: base + additional }
}
