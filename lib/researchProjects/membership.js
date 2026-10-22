import 'server-only'
import { ID_PATTERN } from './config.js'

// PERSONAL-WORK MEMBERSHIP SEAM.
//
// Production has no general class enrollment system. Personal saved work (answers, data, to-do, submission)
// exists only for an account that an explicitly reviewed server-side mapping names. Tomorrow's audience is
// exactly two verified owner accounts, resolved by the owner resolver owned by another task (lib/advancedClasses);
// the integration owner adapts it to this contract. Review is a separate capability (canReview in access.js).
// This module defines the contract and a strict registry loader, and ships with an EMPTY registry, so every
// account is denied personal work until someone reviews and supplies a mapping. Nothing here seeds a membership.
//
// Adapter contract:  resolve({ userId }) -> Promise<null | { classId, groupId, memberId, label }>
//   userId   authenticated Clerk user id (never taken from a request body, query or cookie)
//   classId  class the library is attached to (also must appear in ATTACHED_CLASS_IDS)
//   groupId  team id, or null for an individual record
//   memberId stable opaque id for the student within the class
//   label    short display name for "last edited by" (may be a generic label)
//
// A later narrow integration can replace `activeMembership` with an adapter over a supported
// existing membership source. Nothing here reads request class, group or seat values, and a Clerk
// login on its own is never treated as membership.

export const denyAllMembership = Object.freeze({
  async resolve() {
    return null
  },
})

const ENTRY_KEYS = ['userId', 'classId', 'groupId', 'memberId', 'label', 'reviewedBy', 'reviewedAt']

export function createReviewedRegistryMembership(entries) {
  const byUser = new Map()
  for (const entry of entries) {
    for (const key of Object.keys(entry)) if (!ENTRY_KEYS.includes(key)) throw new Error('Unexpected membership field ' + key)
    if (typeof entry.userId !== 'string' || !entry.userId) throw new Error('Membership entry needs a userId')
    if (!ID_PATTERN.test(entry.classId || '')) throw new Error('Membership entry needs a valid classId')
    if (entry.groupId != null && !ID_PATTERN.test(entry.groupId)) throw new Error('Membership entry has an invalid groupId')
    if (!ID_PATTERN.test(entry.memberId || '')) throw new Error('Membership entry needs a valid memberId')
    if (!entry.reviewedBy || !entry.reviewedAt) throw new Error('Membership entry must record who reviewed it and when')
    if (byUser.has(entry.userId)) throw new Error('Duplicate membership for a user')
    byUser.set(entry.userId, Object.freeze({
      classId: entry.classId,
      groupId: entry.groupId ?? null,
      memberId: entry.memberId,
      label: String(entry.label || 'Team member').slice(0, 40),
    }))
  }
  return Object.freeze({
    async resolve({ userId }) {
      return byUser.get(userId) || null
    },
  })
}

// Reviewed mapping, intentionally empty. Populate only after the coordinator confirms the intended
// existing class and which accounts belong to it. See docs/researchProjects/HANDOFF.md.
export const REVIEWED_MEMBERS = Object.freeze([])

export const activeMembership = createReviewedRegistryMembership(REVIEWED_MEMBERS)
