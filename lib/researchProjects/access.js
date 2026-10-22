import 'server-only'
import { createHash } from 'node:crypto'
import { ATTACHED_CLASS_IDS, ID_PATTERN } from './config.js'
import { activeMembership } from './membership.js'

// Strict server access adapter with two independent capabilities.
//
//   personal  the user has their own saved work space (answers, data, to-do, submission). It exists only when a
//             reviewed membership mapping names the authenticated user AND that class is attached.
//   review    the user may read teams' records, give feedback, record safety review and see answer keys. It is
//             decided ONLY by deps.canReview(userId), which the integration must bind to the exact owner
//             identity. The shipped default denies everyone. It must never be bound to "any Clerk admin".
//
// Both owners get personal work; only the exact FIT admin owner also gets review. Class, group, seat and user
// identity come only from the server; request data is never consulted. A Clerk login alone is nothing.

export class AccessError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'AccessError'
    this.status = status
    this.code = code
  }
}

export function viewerKey(parts) {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24)
}

export function hashMember(memberId) {
  return createHash('sha256').update('member|' + memberId).digest('hex').slice(0, 12)
}

const deny = () => new AccessError(403, 'not_member', 'This library is not available for your account.')

// deps: { authenticate(request) -> userId, canReview(userId) -> boolean (isAdmin is accepted as an alias for
//         older callers), membership, attachedClassIds }
export async function resolveAccess(request, deps) {
  let userId
  try {
    userId = await deps.authenticate(request)
  } catch (error) {
    if (error?.name === 'UnauthorizedError') throw new AccessError(401, 'unauthenticated', 'Sign in to open the research project library.')
    throw new AccessError(503, 'auth_unavailable', 'Sign-in could not be checked. Please try again.')
  }
  if (!userId || typeof userId !== 'string') throw new AccessError(401, 'unauthenticated', 'Sign in to open the research project library.')

  const canReview = (await (deps.canReview ?? deps.isAdmin)(userId)) === true

  let member = null
  try {
    member = await deps.membership.resolve({ userId })
  } catch {
    throw new AccessError(503, 'membership_unavailable', 'Class membership could not be checked. Please try again.')
  }
  let personal = null
  if (member) {
    const valid = ID_PATTERN.test(member.classId || '') && ID_PATTERN.test(member.memberId || '') && (member.groupId == null || ID_PATTERN.test(member.groupId))
    const attached = deps.attachedClassIds ?? ATTACHED_CLASS_IDS
    if (valid && attached.includes(member.classId)) {
      const scope = member.groupId ? 'group:' + member.groupId : 'member:' + member.memberId
      personal = Object.freeze({
        classId: member.classId,
        groupId: member.groupId ?? null,
        memberId: member.memberId,
        scope,
        label: String(member.label || 'Team member').slice(0, 40),
      })
    }
  }
  if (!canReview && !personal) throw deny()

  return Object.freeze({
    role: canReview ? 'teacher' : 'student',
    userId,
    canReview,
    personal,
    viewer: viewerKey(['access', userId, canReview ? 'review' : '-', personal ? personal.classId + ':' + personal.scope : '-']),
  })
}

export function defaultAccessDeps() {
  return {
    async authenticate(request) {
      const { authenticate } = await import('@/lib/authenticate')
      return (await authenticate(request)).userId
    },
    // DEFAULT DENY. Review must be bound to the exact owner resolver during integration (see HANDOFF).
    // Do not replace this with checkAdminPrivileges: that would admit every existing admin.
    async canReview() {
      return false
    },
    membership: activeMembership,
    attachedClassIds: ATTACHED_CLASS_IDS,
  }
}
