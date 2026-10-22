import { PRIVATE_HEADERS } from './config.js'
import { checkLiveAccount, indexBindings, reviewAllowed } from './resolver.js'

// Read-only admin view of who can open Advanced Classes. There is deliberately no grant, revoke or enrol code.
//
// deps: { authenticate() -> userId (throws UnauthorizedError), isAdmin(userId) -> boolean,
//         fetchUser(userId) -> Clerk-shaped user, bindings, provenance, now() }
// The caller is authenticated and admin-checked BEFORE any binding is read or any provider is called.

export const POLICY_TEXT = 'View only. This page and its JSON show the approved list; they cannot change it. The list is a reviewed static server list: changing access means a reviewed code change and deployment, not a button here. Every request re-checks the live account, so a changed email or a lost admin role takes effect immediately. Any account not listed, including other admins, is denied.'

export async function loadAdminAccessView(deps) {
  let userId
  try {
    userId = await deps.authenticate()
  } catch (error) {
    if (error?.name === 'UnauthorizedError') return { status: 401, error: 'Unauthorized' }
    return { status: 503, error: 'Unavailable' }
  }
  if (typeof userId !== 'string' || !userId) return { status: 401, error: 'Unauthorized' }
  let admin = false
  try { admin = (await deps.isAdmin(userId)) === true } catch { admin = false }
  if (!admin) return { status: 403, error: 'Owner access required.' }

  const accounts = []
  for (const binding of indexBindings(deps.bindings).values()) {
    let live = null
    try {
      live = checkLiveAccount(binding, await deps.fetchUser(binding.userId))
    } catch {
      live = null
    }
    const state = live ? live.state : 'provider_unavailable'
    const verified = state === 'verified'
    accounts.push({
      userId: binding.userId,
      label: binding.label,
      email: binding.expectedEmail,
      workspaceId: binding.workspaceId,
      scope: { content: binding.content, personalWork: binding.personalWork === true, review: binding.review === true },
      reviewRequiresLiveAdminRole: binding.review === true,
      bindingCheckedAt: binding.checkedAt,
      note: binding.note,
      verification: {
        state,
        emailVerified: verified,
        liveAdminRole: verified ? live.adminRole : null,
        effective: {
          content: verified ? binding.content : 'denied',
          personalWork: verified && binding.personalWork === true,
          review: verified && reviewAllowed(binding, live),
        },
      },
    })
  }
  return {
    status: 200,
    body: {
      policy: 'view-only',
      explanation: POLICY_TEXT,
      defaultForOthers: 'denied',
      liveCheckedAt: (deps.now ? deps.now() : new Date()).toISOString(),
      provenance: deps.provenance,
      accounts,
    },
  }
}

const jsonResponse = (body, status, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...PRIVATE_HEADERS, ...extra },
})

// `deps` may be an object or an async factory so the server-only wiring loads lazily.
export async function handleAccessGet(deps) {
  let result
  try {
    result = await loadAdminAccessView(typeof deps === 'function' ? await deps() : deps)
  } catch {
    return jsonResponse({ error: 'Unavailable' }, 503)
  }
  return result.status === 200 ? jsonResponse(result.body, 200) : jsonResponse({ error: result.error }, result.status)
}

export function methodNotAllowed() {
  return jsonResponse({ error: 'This endpoint is read only.' }, 405, { Allow: 'GET' })
}
