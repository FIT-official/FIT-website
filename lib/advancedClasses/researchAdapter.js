import { resolveOwnerAccess } from './resolver.js'

// Feeds the existing research project access adapter (lib/researchProjects/access.js resolveAccess deps)
// from the owner resolver. Nothing here imports researchProjects: the integration owner passes its deps in.
//
//   baseDeps  the research project deps (its `authenticate` is reused unchanged)
//   mode      'student'  every allowed owner is a student of the owner workspace, saving its own answers
//                        under its opaque memberScope. isAdmin is always false, so a real admin role never
//                        widens access here.
//             'teacher'  isAdmin is true only when the resolver grants review (FIT account with a live admin
//                        role). Any other admin is denied, and the personal account never becomes a teacher.
//   resolve   injectable (userId) -> resolveOwnerAccess result; defaults to the resolver over bindings/fetchUser
//
// Create a fresh instance per request: results are memoised per user for the life of the instance so
// isAdmin and membership share one live provider check.
export function createOwnerResearchDeps({ baseDeps, bindings, fetchUser, mode = 'student', workspaceId, resolve }) {
  if (mode !== 'student' && mode !== 'teacher') throw new Error('mode must be student or teacher')
  const memo = new Map()
  const lookup = (userId) => {
    if (!memo.has(userId)) memo.set(userId, (resolve || ((id) => resolveOwnerAccess({ userId: id, bindings, fetchUser })))(userId))
    return memo.get(userId)
  }
  const workspace = workspaceId || bindings?.[0]?.workspaceId
  return {
    ...baseDeps,
    attachedClassIds: [workspace],
    async isAdmin(userId) {
      if (mode !== 'teacher') return false
      const result = await lookup(userId)
      return result.allowed === true && result.scope.review === true
    },
    membership: {
      async resolve({ userId }) {
        const result = await lookup(userId)
        if (!result.allowed || result.workspaceId !== workspace) return null
        return { classId: result.workspaceId, groupId: null, memberId: result.memberScope, label: 'Owner' }
      },
    },
  }
}
