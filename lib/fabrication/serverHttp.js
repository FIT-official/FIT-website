import { NextResponse } from 'next/server'

export class FabricationError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message)
    this.status = status
    this.code = code
  }
}
export const fail = (message, status, code) => { throw new FabricationError(message, status, code) }
export const json = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
export function failure(error) {
  if (error instanceof FabricationError || (error?.name === 'CreatorQuotaError')) {
    return json({ error: error.message, code: error.code || 'quota_reached' }, error.status)
  }
  console.error('Fabrication service error:', error?.code || error?.name || 'unavailable')
  return json({ error: 'This service is temporarily unavailable. Please try again.', code: 'service_unavailable' }, 503)
}

export async function readBytes(request, maximum) {
  if (Number(request.headers.get('content-length')) > maximum) fail('Payload too large.', 413)
  const reader = request.body?.getReader()
  if (!reader) fail('Request body is required.')
  let timer
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new FabricationError('The upload took too long.', 408)), 10000) })
  const chunks = []
  let count = 0
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout])
      if (done) break
      count += value.byteLength
      if (count > maximum) fail('Payload too large.', 413)
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks)
  } finally {
    clearTimeout(timer)
    reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function readJson(request, maximum = 16384) {
  if (!request.headers.get('content-type')?.includes('application/json')) fail('Send a JSON request.')
  let input
  try { input = JSON.parse((await readBytes(request, maximum)).toString('utf8')) } catch (error) {
    if (error instanceof FabricationError) throw error
    fail('Invalid JSON.')
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Send a JSON object.')
  return input
}

export function checkedId(value, name = 'ID') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) fail(`Invalid ${name}.`)
  return value
}
export function checkedClientRequestId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) fail('A valid clientRequestId is required.')
  return value.toLowerCase()
}
export function checkedCreatorId(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 160) fail('Choose a creator.')
  return value.trim()
}
