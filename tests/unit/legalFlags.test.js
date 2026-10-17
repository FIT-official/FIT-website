import {
  describe,
  it,
  expect,
} from 'vitest'

import {
  isTermsCheckboxEnabled,
  isCreatorTermsAcceptanceEnabled,
  isCreatorWalkthroughEnabled,
} from '@/lib/legalFlags'

describe('Legal feature flags', () => {
  it('defaults every flag to OFF', () => {
    expect(isTermsCheckboxEnabled({})).toBe(false)
    expect(isCreatorTermsAcceptanceEnabled({})).toBe(false)
    expect(isCreatorWalkthroughEnabled({})).toBe(false)
  })

  it('enables customer acceptance only with exact true', () => {
    for (const value of [
      '',
      'TRUE',
      'True',
      '1',
      'yes',
      'false',
    ]) {
      expect(isTermsCheckboxEnabled({
        TERMS_CHECKBOX_ENABLED: value,
      })).toBe(false)
    }

    expect(isTermsCheckboxEnabled({
      TERMS_CHECKBOX_ENABLED: 'true',
    })).toBe(true)
  })

  it('enables creator acceptance independently', () => {
    const creatorOnly = {
      CREATOR_TERMS_ACCEPTANCE_ENABLED: 'true',
    }

    expect(
      isCreatorTermsAcceptanceEnabled(creatorOnly)
    ).toBe(true)

    expect(
      isTermsCheckboxEnabled(creatorOnly)
    ).toBe(false)

    const customerOnly = {
      TERMS_CHECKBOX_ENABLED: 'true',
    }

    expect(
      isCreatorTermsAcceptanceEnabled(customerOnly)
    ).toBe(false)

    expect(
      isTermsCheckboxEnabled(customerOnly)
    ).toBe(true)
  })

  it('does not enable creator acceptance for other values', () => {
    for (const value of [
      '',
      'TRUE',
      'True',
      '1',
      'false',
    ]) {
      expect(isCreatorTermsAcceptanceEnabled({
        CREATOR_TERMS_ACCEPTANCE_ENABLED: value,
      })).toBe(false)
    }
  })
})
