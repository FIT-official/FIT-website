import { useCallback, useEffect, useRef } from 'react'

// Browser-side helpers. Only same-origin, cookie-authenticated requests to /api/research-projects.

export class NetworkError extends Error {
  constructor() {
    super('network')
    this.name = 'NetworkError'
  }
}

const BASE = '/api/research-projects'

export const recordsUrl = (slug, extra = '') => `${BASE}/records?slug=${encodeURIComponent(slug)}${extra}`
export const keysUrl = (slug, extra = '') => `${BASE}/keys?slug=${encodeURIComponent(slug)}${extra}`
export const RECORDS_ENDPOINT = `${BASE}/records`
export const ACTIONS_ENDPOINT = `${BASE}/actions`

export async function requestJson(method, url, { body, signal } = {}) {
  let response
  try {
    response = await fetch(url, {
      method,
      signal,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new NetworkError()
  }
  let data = null
  try { data = await response.json() } catch { data = null }
  return { ok: response.ok, status: response.status, data }
}

export const isAbort = error => error?.name === 'AbortError'

// Stale-response guard: starting a new request aborts the previous one and invalidates its result;
// unmounting invalidates everything. Callers check `current()` after every await.
export function useRequestGuard() {
  const epoch = useRef(0)
  const controller = useRef(null)
  useEffect(() => () => {
    epoch.current += 1
    controller.current?.abort()
  }, [])
  return useCallback(() => {
    controller.current?.abort()
    const ctl = new AbortController()
    controller.current = ctl
    const mine = ++epoch.current
    return { signal: ctl.signal, current: () => epoch.current === mine && !ctl.signal.aborted }
  }, [])
}
