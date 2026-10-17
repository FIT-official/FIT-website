import { pickAddressFields, isAddressComplete } from '../checkoutAddressGate.js'

// Creator access to buyer location data (enforced server-side in the creator print-jobs API).
// A creator sees a buyer's SHIPPING details only for a print request routed to THEIR print service and only while it
// is in a fulfilment state (paid -> printing -> printed -> shipped). Before payment, after delivery/cancellation, and
// for anyone else's requests: nothing. The buyer's area/profile is never shared with creators. FIT admin tools use
// their own admin-only routes.
export const CREATOR_FULFILMENT_STATUSES = Object.freeze(['paid', 'printing', 'printed', 'shipped'])

export function creatorMayShip(job, viewerUserId) {
  return Boolean(job && viewerUserId && job.creatorUserId === viewerUserId && CREATOR_FULFILMENT_STATUSES.includes(job.status))
}

// Only the fields needed to post the order. `buyer` is the buyer's stored record ({ contact, guestContact }).
export function creatorShippingFields(job, viewerUserId, buyer) {
  if (!creatorMayShip(job, viewerUserId)) return null
  const raw = buyer?.contact?.address || buyer?.guestContact?.address
  if (!raw || !isAddressComplete(raw)) return null
  const phone = buyer?.contact?.phone?.number ? `${buyer.contact.phone.countryCode || ''} ${buyer.contact.phone.number}`.trim() : ''
  return { name: String(job.userName || buyer?.guestContact?.name || '').slice(0, 100), phone, address: pickAddressFields(raw) }
}