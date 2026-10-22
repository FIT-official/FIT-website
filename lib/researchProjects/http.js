import 'server-only'
import { PRIVATE_HEADERS, LIMITS } from './config.js'
import { resolveAccess, AccessError } from './access.js'
import { getProject } from './content/index.js'
import { ServiceError, readRecord, readClassOverview, saveRecord, applyAction, readKeys } from './service.js'
import { ValidationError } from './schema.js'
import { findAsset, readAsset, ASSET_TYPES } from './assets.js'

// Thin HTTP layer. Order for every request:
//   1. same-origin check (mutations only)
//   2. server-side access resolution (401 / 403 before anything else is revealed or read)
//   3. bounded JSON body read (mutations only), project lookup, then the service call
// Every response is private, non-cacheable, noindex and nosniff.

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

const TOO_LARGE = () => new HttpError(413, 'too_large', 'That is too much data to save at once.')

// Reads the body as a stream and stops as soon as it passes the limit, so an oversized or unbounded upload is
// never buffered whole. Only up to limit + one chunk is ever held.
export async function readJson(request, limit = LIMITS.bodyBytes) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new HttpError(415, 'unsupported', 'Use JSON.')
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) {
    await request.body?.cancel().catch(() => {})
    throw TOO_LARGE()
  }
  if (!request.body) throw new HttpError(400, 'invalid', 'The request was not valid JSON.')
  const reader = request.body.getReader()
  const chunks = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > limit) {
      await reader.cancel().catch(() => {})
      throw TOO_LARGE()
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
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
    if (mutation) assertSameOrigin(request)
    const access = await resolveAccess(request, deps)
    const body = mutation ? await readJson(request) : null
    const result = await fn(access, body)
    return json(200, { ...result, viewer: access.viewer, role: access.role, canReview: access.canReview, hasPersonal: !!access.personal })
  } catch (error) {
    return failure(error)
  }
}

const queryOf = request => Object.fromEntries(new URL(request.url).searchParams)

export function handleRecordsGet(request, deps) {
  return run(request, deps, { mutation: false }, async access => {
    const query = queryOf(request)
    const project = projectFor(query.slug)
    if (access.canReview && query.classId && !query.scope) return readClassOverview(deps, access, project, query)
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

// Protected lesson diagrams and teaching files. The request names an asset id from the strict manifest, never a
// path. Anonymous and unauthorised callers receive the same JSON failure as every other endpoint, and a
// teacher-only asset is indistinguishable from a missing one for everyone without the review role.
export async function handleAssetGet(request, deps) {
  try {
    const access = await resolveAccess(request, deps)
    const asset = findAsset(new URL(request.url).searchParams.get('id'))
    if (!asset || (asset.role === 'teacher' && !access.canReview)) throw new HttpError(404, 'not_found', 'File not found.')
    const type = ASSET_TYPES[asset.kind]
    let buffer
    try {
      buffer = await (deps.readAsset ?? readAsset)(asset)
    } catch (error) {
      console.error('researchProjects: asset unavailable', asset.id, error?.code || error?.message)
      throw new HttpError(503, 'unavailable', 'That file is temporarily unavailable.')
    }
    return new Response(buffer, {
      status: 200,
      headers: {
        ...PRIVATE_HEADERS,
        'Content-Type': type.mime,
        'Content-Length': String(buffer.byteLength),
        'Content-Disposition': `${type.disposition}; filename="${asset.filename}"`,
        // An SVG opened directly in a tab is sandboxed and cannot run script or load anything.
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    })
  } catch (error) {
    return failure(error)
  }
}
