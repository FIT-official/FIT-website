// Delivery choices for a Fix It Today print request. The admin curates the
// custom-print product's delivery types (type + flat price); AppSettings gives
// each type its display name and description. Pure helpers, no I/O.

export const FALLBACK_DELIVERY_OPTION = Object.freeze({
  type: 'custom_print', displayName: 'Collect from Fix It Today',
  description: 'We email you when it is ready to collect.', price: 0, needsAddress: false, fallback: true,
})

const PICKUP_PATTERN = /pick[\s_-]?up|collect|self/i

export function needsDeliveryAddress(option = {}) {
  return !PICKUP_PATTERN.test(`${option.type || ''} ${option.displayName || ''}`)
}

export function buildDeliveryOptions(productDeliveryTypes = [], appDeliveryTypes = []) {
  const meta = new Map((Array.isArray(appDeliveryTypes) ? appDeliveryTypes : []).map(item => [item?.name, item]))
  const options = (Array.isArray(productDeliveryTypes) ? productDeliveryTypes : [])
    .filter(item => item && item.type)
    .map(item => {
      const info = meta.get(item.type) || {}
      const option = {
        type: item.type,
        displayName: info.displayName || item.type,
        description: item.customDescription || info.description || '',
        price: Number(item.customPrice ?? item.price ?? 0) || 0,
      }
      return { ...option, needsAddress: needsDeliveryAddress(option) }
    })
  return options.length ? options : [FALLBACK_DELIVERY_OPTION]
}

export const ADDRESS_REQUIRED_FIELDS = ['street', 'city', 'state', 'postalCode', 'country']

export function addressComplete(address) {
  return Boolean(address) && ADDRESS_REQUIRED_FIELDS.every(key => String(address[key] || '').trim())
}
