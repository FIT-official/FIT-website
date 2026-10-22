import { PRIVATE_HEADERS, LIMITS } from './config.js'
import { resolveAccess, AccessError } from './access.js'
import { getProject } from './content/index.js'
import { ServiceError, readRecord, readClassOverview, saveRecord, applyAction, readKeys } from './service.js'
import { ValidationError } from './schema.js'

// Thin HTTP layer. Order for every request:
//   1. same-origin check and bounded JSON parse (mutations only)
//   2. server-side access resolution (401 / 403 before anything else is revealed)
//   3. project lookup, then the service call
// Every response is private, non-cacheable and noindex.

class HttpError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function assertSameOrigin(request) {
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin) throw new HttpError(403, 'cross_origin', 'Open the library on this website to save work.')
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') throw new HttpError(403, 'cross_origin', 'Open the library on this website to save work.')
}

export async function readJson(request, limit = LIMITS.bodyBytes) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new HttpError(415, 'unsupported', 'Use JSON.')
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) throw new HttpError(413, 'too_large', 'That is too much data to save at once.')
  const raw = await request.text()
  if (new TextEncoder().encode(raw).length > limit) throw new HttpError(413, 'too_large', 'That is too much data to save at once.')
  try {
    return JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'invalid', 'The request was not valid JSON.')
  }
}

function failure(error) {
  if (error instanceof AccessError || error instanceof HttpError || error instanceof ValidationError) {
    return json(error.status, { error: error.message, code: error.code, ...(error.path ? { path: error.path } : {}) })
  }
  if (error instanceof ServiceError) {
    return json(error.status, { error: error.message, code: error.code, ...error.extra })
  }
  console.error('researchProjects: unexpected failure', error?.name || 'Error')
  return json(503, { error: 'The research library is temporarily unavailable. Your work is kept on this device; try again shortly.', code: 'unavailable' })
}

function projectFor(slug) {
  const project = getProject(slug)
  if (!project) throw new HttpError(404, 'not_found', 'Project not found.')
  return project
}

async function run(request, deps, { mutation }, fn) {
  try {
    let body = null
    if (mutation) {
      assertSameOrigin(request)
      body = await readJson(request)
    }
    const access = await resolveAccess(request, deps)
    const result = await fn(access, body)
    return json(200, { ...result, viewer: access.viewer, role: access.role })
  } catch (error) {
    return failure(error)
  }
}

const queryOf = request => Object.fromEntries(new URL(request.url).searchParams)

export function handleRecordsGet(request, deps) {
  return run(request, deps, { mutation: false }, async access => {
    const query = queryOf(request)
    const project = projectFor(query.slug)
    if (access.role === 'teacher' && query.classId && !query.scope) return readClassOverview(deps, access, project, query)
    return readRecord(deps, access, project, query)
  })
}

export function handleRecordsPut(request, deps) {
  return run(request, deps, { mutation: true }, async (access, body) => {
    const project = projectFor(body?.slug)
    return saveRecord(deps, access, project, body)
  })
}

export function handleActionsPost(request, deps) {
  return run(request, deps, { mutation: true }, async (access, body) => {
    const project = projectFor(body?.slug)
    return applyAction(deps, access, project, body)
  })
}

export function handleKeysGet(request, deps) {
  return run(request, deps, { mutation: false }, async access => {
    const query = queryOf(request)
    const project = projectFor(query.slug)
    return readKeys(deps, access, project, query)
  })
}
