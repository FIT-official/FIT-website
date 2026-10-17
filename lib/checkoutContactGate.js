export function needsGuestContactStep({
  guest = false,
  contactReady = false,
  hasCartItems = false,
} = {}) {
  return Boolean(
    guest &&
    !contactReady &&
    hasCartItems
  )
}

export function checkoutStepAfterContact({
  termsRequired = false,
  termsTicked = false,
} = {}) {
  if (termsRequired && !termsTicked) {
    return 'review'
  }

  return 'payment'
}
