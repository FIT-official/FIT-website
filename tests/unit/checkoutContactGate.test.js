import {
  describe,
  it,
  expect,
} from 'vitest'

import {
  needsGuestContactStep,
  checkoutStepAfterContact,
} from '@/lib/checkoutContactGate'

describe('Guest checkout', () => {
  it('requires contact for an incomplete guest', () => {
    expect(needsGuestContactStep({
      guest: true,
      contactReady: false,
      hasCartItems: true,
    })).toBe(true)
  })

  it('never reopens contact after server confirmation', () => {
    for (const review of [false, true]) {
      expect(needsGuestContactStep({
        guest: true,
        contactReady: true,
        hasCartItems: true,
        review,
      })).toBe(false)
    }
  })

  it('does not require guest contact for signed-in users', () => {
    expect(needsGuestContactStep({
      guest: false,
      contactReady: false,
      hasCartItems: true,
    })).toBe(false)
  })

  it('does not show contact for an empty cart', () => {
    expect(needsGuestContactStep({
      guest: true,
      contactReady: false,
      hasCartItems: false,
    })).toBe(false)
  })

  it('preserves flag-off continuation', () => {
    expect(checkoutStepAfterContact({
      termsRequired: false,
      termsTicked: false,
    })).toBe('payment')
  })

  it('routes unticked gated checkout to review', () => {
    expect(checkoutStepAfterContact({
      termsRequired: true,
      termsTicked: false,
    })).toBe('review')
  })

  it('allows accepted checkout to continue', () => {
    expect(checkoutStepAfterContact({
      termsRequired: true,
      termsTicked: true,
    })).toBe('payment')
  })
})
