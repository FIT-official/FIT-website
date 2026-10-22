import 'server-only'
import { BINDINGS_PROVENANCE, OWNER_BINDINGS } from './bindings.server.js'
import { resolveOwnerAccess } from './resolver.js'

// Production wiring: existing Clerk helpers plus the server-only bindings. Tests inject their own.

export async function fetchClerkUser(userId) {
  const { clerkClient } = await import('@clerk/nextjs/server')
  const client = await clerkClient()
  return client.users.getUser(userId)
}

async function authenticatedUserId() {
  const { authenticate } = await import('@/lib/authenticate')
  return (await authenticate()).userId
}

export function defaultAdminDeps() {
  return {
    authenticate: authenticatedUserId,
    async isAdmin(userId) {
      const { checkAdminPrivileges } = await import('@/lib/checkPrivileges')
      return checkAdminPrivileges(userId)
    },
    fetchUser: fetchClerkUser,
    bindings: OWNER_BINDINGS,
    provenance: BINDINGS_PROVENANCE,
    now: () => new Date(),
  }
}

// Page gate for the integration owner. Returns booleans only; never identities.
export async function getOwnerGate({ authenticate = authenticatedUserId, fetchUser = fetchClerkUser, bindings = OWNER_BINDINGS } = {}) {
  let userId = null
  try {
    userId = await authenticate()
  } catch {
    return { allowed: false, signedIn: false, review: false }
  }
  const result = await resolveOwnerAccess({ userId, bindings, fetchUser })
  return { allowed: result.allowed, signedIn: true, review: result.allowed && result.scope.review }
}

// Inputs for createOwnerResearchDeps (lib/advancedClasses/researchAdapter.js).
export function ownerResearchInputs() {
  return { bindings: OWNER_BINDINGS, fetchUser: fetchClerkUser, workspaceId: OWNER_BINDINGS[0].workspaceId }
}
