import 'server-only'
import { createOwnerResearchDeps } from '@/lib/advancedClasses/researchAdapter'
import { ownerResearchInputs } from '@/lib/advancedClasses/defaults.server'
import { resolveOwnerAccess } from '@/lib/advancedClasses/resolver'

// A fresh request-scoped lookup; no cross-account or shared provider cache.
export function ownerAccessDeps(baseDeps) {
  const inputs = ownerResearchInputs()
  const checks = new Map()
  const resolve = userId => {
    if (!checks.has(userId)) checks.set(userId, resolveOwnerAccess({ userId, ...inputs }))
    return checks.get(userId)
  }
  return {
    ...createOwnerResearchDeps({ baseDeps, ...inputs, mode: 'student', resolve }),
    async canReview(userId) {
      const result = await resolve(userId)
      return result.allowed === true && result.scope.review === true
    },
  }
}
