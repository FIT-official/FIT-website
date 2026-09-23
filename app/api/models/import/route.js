import { NextResponse } from 'next/server'
import { importPublicModel } from '@/lib/modelImport'
import { sourceDetails } from '@/lib/modelImport/discovery'
import { limitModelImport } from '@/lib/modelImport/rateLimit'
import { importError, ModelImportError, UPLOAD_HELP } from '@/lib/modelImport/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

async function readInput(request) {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    throw importError('invalid_request', 'Send a model link as JSON.', 400)
  }
  if (Number(request.headers.get('content-length')) > 8192) throw importError('invalid_request', 'The model link request is too large.', 400)
  const reader = request.body?.getReader()
  if (!reader) throw importError('invalid_request', 'Enter a model link.', 400)
  const chunks = []
  let length = 0
  let timer
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(importError('invalid_request', 'The model link request took too long.', 400)), 3000)
  })
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline])
      if (done) break
      length += value.byteLength
      if (length > 8192) {
        reader.cancel().catch(() => {})
        throw importError('invalid_request', 'The model link request is too large.', 400)
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    clearTimeout(timer)
    reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  let input
  try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw importError('invalid_request', 'Enter a valid model link.', 400) }
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.url !== 'string' ||
      (input.selectionUrl != null && typeof input.selectionUrl !== 'string')) throw importError('invalid_request', 'Enter a valid model link.', 400)
  return { url: input.url, selectionUrl: input.selectionUrl || undefined }
}

export async function POST(request) {
  let source = null
  let rateHeaders = {}
  try {
    const limit = await limitModelImport(request.headers)
    rateHeaders = limit.headers
    if (!limit.allowed) throw importError('rate_limited', 'Too many link imports. Please wait a minute and try again, or upload the file.', 429)
    const input = await readInput(request)
    source = sourceDetails(input.url)
    const result = await importPublicModel(input)
    if (result.status === 'select_file') {
      return NextResponse.json(result, { headers: { ...rateHeaders, 'Cache-Control': 'no-store' } })
    }
    const { file } = result
    return new NextResponse(new Uint8Array(file.body), {
      headers: {
        ...rateHeaders,
        'Cache-Control': 'no-store',
        'Content-Type': file.contentType,
        'Content-Length': String(file.body.length),
        'Content-Disposition': `attachment; filename="${file.name.replace(/"/g, '_')}"`,
        'X-Content-Type-Options': 'nosniff',
        'X-Model-Filename': encodeURIComponent(file.name),
        'X-Model-Source-Url': encodeURIComponent(result.source.url),
        'X-Model-Format': file.format,
        'X-Model-Attribution': encodeURIComponent(result.source.attribution.slice(0, 512)),
      },
    })
  } catch (error) {
    const known = error instanceof ModelImportError
    const status = known ? error.status : 503
    return NextResponse.json({
      status: 'upload_required',
      code: known ? error.code : 'import_unavailable',
      message: `${known ? error.message : 'Link import is temporarily unavailable.'} ${UPLOAD_HELP}`,
      source,
      supportedFormats: ['stl', 'obj', '3mf'],
    }, { status, headers: { ...rateHeaders, 'Cache-Control': 'no-store' } })
  }
}
