// Pure helpers shared by the cart, the checkout page, the breakdown route,
// the checkout session route and the contact address route so all of them
// agree on when a delivery address is needed and when one counts as
// complete. No I/O.

// Fields an address must have. Unit number and state are optional (many
// Singapore addresses have no state; Stripe accepts an empty one).
export const REQUIRED_ADDRESS_FIELDS = ['street', 'city', 'postalCode', 'country']
export const ADDRESS_FIELDS = ['street', 'unitNumber', 'city', 'state', 'postalCode', 'country']

// Delivery types that never ship anything: digital downloads and any
// pickup/self-collection option an admin has configured. Matched by name
// for now; exported so it can become an explicit list later.
export const NO_ADDRESS_DELIVERY_TYPES = ['digital', 'pickup', 'pick_up', 'pick-up', 'collect']
const NO_ADDRESS_PATTERN = new RegExp(NO_ADDRESS_DELIVERY_TYPES.join('|'), 'i')

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

// Only the known address keys, trimmed; drops _id and anything else a
// document or form might carry.
export function pickAddressFields(address) {
  const a = address && typeof address === 'object' ? address : {}
  return Object.fromEntries(ADDRESS_FIELDS.map((field) => [field, String(a[field] ?? '').trim()]))
}

export function addressesEqual(a, b) {
  const x = pickAddressFields(a)
  const y = pickAddressFields(b)
  return ADDRESS_FIELDS.every((field) => x[field] === y[field])
}

// True when at least one breakdown line ships to the customer.
export function cartNeedsDeliveryAddress(cartBreakdown) {
  return (cartBreakdown || []).some((line) => lineNeedsDeliveryAddress(line?.chosenDeliveryType))
}

// First line whose cart delivery type the product/request no longer offers.
export function deliveryMismatchReason(cartBreakdown) {
  const line = (cartBreakdown || []).find((l) => l?.deliveryTypeMismatch)
  return line ? pickDeliveryOptionMessage(line.name) : null
}

export function pickDeliveryOptionMessage(name) {
  return `Pick a delivery option for ${name || 'this item'} in the cart.`
}

export const ADD_ADDRESS_TO_PAY = 'Add a delivery address to pay.'
export const ADD_ADDRESS_TO_CHECKOUT = 'Add a delivery address to check out.'
