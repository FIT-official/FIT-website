import { resolveAccess, AccessError } from './access.js'
import { ATTACHED_CLASS_IDS } from './config.js'

// Page-level gate used by /class/projects. Never throws: callers render a neutral notice that does
// not depend on which project was requested, so an unauthorised visitor learns nothing about content.
export async function getPageAccess(deps) {
  try {
    const access = await resolveAccess(null, deps)
    return {
      ok: true,
      role: access.role,
      viewer: access.viewer,
      canReview: deps.canReview ? await deps.canReview(access.userId) : access.role === 'teacher',
      classIds: access.role === 'teacher' ? [...(deps.attachedClassIds ?? ATTACHED_CLASS_IDS)] : null,
    }
  } catch (error) {
    if (error instanceof AccessError) return { ok: false, status: error.status, code: error.code }
    console.error('researchProjects: page access failed', error?.name || 'Error')
    return { ok: false, status: 503, code: 'unavailable' }
  }
}
