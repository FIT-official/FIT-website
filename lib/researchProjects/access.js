import { createHash } from 'node:crypto'
import { ATTACHED_CLASS_IDS, ID_PATTERN } from './config.js'
import { activeMembership } from './membership.js'

// Strict server access adapter.
//   teacher  the existing authoritative admin check (Clerk publicMetadata.role === 'admin')
//   student  only when a reviewed membership mapping names the authenticated user AND that class is
//            attached to this library. Absent mapping means denied.
// Class, group, seat and user identity come only from the server; request data is never consulted.

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

// deps: { authenticate(request) -> userId, isAdmin(userId) -> boolean, membership, attachedClassIds }
export async function resolveAccess(request, deps) {
  let userId
  try {
    userId = await deps.authenticate(request)
  } catch (error) {
    if (error?.name === 'UnauthorizedError') throw new AccessError(401, 'unauthenticated', 'Sign in to open the research project library.')
    throw new AccessError(503, 'auth_unavailable', 'Sign-in could not be checked. Please try again.')
  }
  if (!userId || typeof userId !== 'string') throw new AccessError(401, 'unauthenticated', 'Sign in to open the research project library.')

  if (await deps.isAdmin(userId)) {
    return Object.freeze({ role: 'teacher', userId, viewer: viewerKey(['teacher', userId]) })
  }

  let member = null
  try {
    member = await deps.membership.resolve({ userId })
  } catch {
    throw new AccessError(503, 'membership_unavailable', 'Class membership could not be checked. Please try again.')
  }
  if (!member) throw new AccessError(403, 'not_member', 'This library is not available for your account.')
  if (!ID_PATTERN.test(member.classId || '') || !ID_PATTERN.test(member.memberId || '') || (member.groupId != null && !ID_PATTERN.test(member.groupId))) {
    throw new AccessError(403, 'not_member', 'This library is not available for your account.')
  }
  const attached = deps.attachedClassIds ?? ATTACHED_CLASS_IDS
  if (!attached.includes(member.classId)) throw new AccessError(403, 'not_member', 'This library is not available for your account.')

  const scope = member.groupId ? 'group:' + member.groupId : 'member:' + member.memberId
  return Object.freeze({
    role: 'student',
    userId,
    classId: member.classId,
    groupId: member.groupId ?? null,
    memberId: member.memberId,
    scope,
    label: String(member.label || 'Team member').slice(0, 40),
    viewer: viewerKey(['student', userId, member.classId, scope]),
  })
}

export function isTeacher(access) {
  return access.role === 'teacher'
}

export function defaultAccessDeps() {
  return {
    async authenticate(request) {
      const { authenticate } = await import('@/lib/authenticate')
      return (await authenticate(request)).userId
    },
    async isAdmin(userId) {
      const { checkAdminPrivileges } = await import('@/lib/checkPrivileges')
      return checkAdminPrivileges(userId)
    },
    membership: activeMembership,
    attachedClassIds: ATTACHED_CLASS_IDS,
  }
}
