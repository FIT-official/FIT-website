export function isTermsCheckboxEnabled(env = process.env) {
  return env.TERMS_CHECKBOX_ENABLED === 'true'
}

export function isCreatorTermsAcceptanceEnabled(env = process.env) {
  return env.CREATOR_TERMS_ACCEPTANCE_ENABLED === 'true'
}

export function isCreatorWalkthroughEnabled(env = process.env) {
  return env.CREATOR_WALKTHROUGH_ENABLED === 'true'
}
