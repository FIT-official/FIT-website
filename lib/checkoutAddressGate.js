// Pure helpers shared by the cart, the checkout page and the breakdown route
// so all three agree on when a delivery address is needed and when one counts
// as complete. No I/O.

// Fields /api/user/contact/address POST insists on (see that route's guard).
export const REQUIRED_ADDRESS_FIELDS = ['street', 'unitNumber', 'city', 'state', 'postalCode', 'country']

// Delivery types that never ship anything: digital downloads and any
// pickup/self-collection option an admin has configured.
const NO_ADDRESS_PATTERN = /digital|pickup|pick_up|pick-up|collect/i

export function lineNeedsDeliveryAddress(chosenDeliveryType) {
  const type = String(chosenDeliveryType || '').trim()
  if (!type) return true
  return !NO_ADDRESS_PATTERN.test(type)
}

export function isAddressComplete(address) {
  if (!address || typeof address !== 'object') return false
  return REQUIRED_ADDRESS_FIELDS.every((field) => String(address[field] || '').trim().length > 0)
}

export function missingAddressFields(address) {
  const a = address && typeof address === 'object' ? address : {}
  return REQUIRED_ADDRESS_FIELDS.filter((field) => !String(a[field] || '').trim())
}

// True when at least one breakdown line ships to the customer.
export function cartNeedsDeliveryAddress(cartBreakdown) {
  return (cartBreakdown || []).some((line) => lineNeedsDeliveryAddress(line?.chosenDeliveryType))
}

export const ADD_ADDRESS_TO_PAY = 'Add a delivery address to pay.'
export const ADD_ADDRESS_TO_CHECKOUT = 'Add a delivery address to check out.'
