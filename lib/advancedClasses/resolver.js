// Pure, injectable owner-access resolver. No imports, no provider calls of its own.
//
//   bindings   [{ userId, expectedEmail, review, memberScope, workspaceId, content, personalWork, ... }]
//   fetchUser  async (userId) -> authoritative Clerk-shaped user, or throws
//
// Everything defaults to deny. Unknown ids are rejected before any provider call is made.

export const DENY = Object.freeze({
  noUser: 'no_user',
  unknown: 'unknown_account',
  unavailable: 'provider_unavailable',
  mismatch: 'account_mismatch',
  unverified: 'email_unverified',
  emailMismatch: 'email_mismatch',
  blocked: 'account_blocked',
})

const norm = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')

export function indexBindings(bindings) {
  const byId = new Map()
  for (const binding of bindings || []) {
    if (!binding || typeof binding.userId !== 'string' || !binding.userId) throw new Error('Binding needs a userId')
    if (!norm(binding.expectedEmail) || !binding.memberScope || !binding.workspaceId) throw new Error('Binding is incomplete')
    if (byId.has(binding.userId)) throw new Error('Duplicate binding')
    byId.set(binding.userId, binding)
  }
  return byId
}

// Verifies the live account against one binding. Returns { state, adminRole }.
//   state: 'verified' | DENY.* reason
export function checkLiveAccount(binding, user) {
  if (!user || user.id !== binding.userId) return { state: DENY.mismatch, adminRole: false }
  if (user.banned === true || user.locked === true) return { state: DENY.blocked, adminRole: false }
  const primary = (user.emailAddresses || []).find((address) => address && address.id === user.primaryEmailAddressId)
  if (!primary || norm(primary.emailAddress) !== norm(binding.expectedEmail)) return { state: DENY.emailMismatch, adminRole: false }
  if (primary.verification?.status !== 'verified') return { state: DENY.unverified, adminRole: false }
  return { state: 'verified', adminRole: user.publicMetadata?.role === 'admin' }
}

export function reviewAllowed(binding, live) {
  return live.state === 'verified' && binding.review === true && live.adminRole === true
}

export async function resolveOwnerAccess({ userId, bindings, fetchUser }) {
  if (typeof userId !== 'string' || !userId) return { allowed: false, reason: DENY.noUser }
  const binding = indexBindings(bindings).get(userId)
  if (!binding) return { allowed: false, reason: DENY.unknown }
  let user
  try {
    user = await fetchUser(userId)
  } catch {
    return { allowed: false, reason: DENY.unavailable }
  }
  const live = checkLiveAccount(binding, user)
  if (live.state !== 'verified') return { allowed: false, reason: live.state }
  return {
    allowed: true,
    binding,
    workspaceId: binding.workspaceId,
    memberScope: binding.memberScope,
    scope: { content: binding.content, personalWork: binding.personalWork === true, review: reviewAllowed(binding, live) },
    verification: { emailVerified: true, adminRole: live.adminRole },
  }
}
