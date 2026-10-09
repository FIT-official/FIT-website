'use client'
import { useEffect, useRef, useState } from 'react'

export async function communityFetch(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Unable to load community. Please try again.')
  return data
}
export function useCommunityPage(url, scope = 'public') {
  const [version, setVersion] = useState(0), [state, setState] = useState({})
  const key = `${scope}|${url}|${version}`
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    setState({ key, loading: true })
    communityFetch(url, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setState({ key, data }) }).catch(error => { if (!controller.signal.aborted) setState({ key, error: error.message }) })
    return () => controller.abort()
  }, [key, url])
  return { ...(state.key === key ? state : { loading: Boolean(url) }), reload: () => setVersion(value => value + 1) }
}
export function useSubmissionKey() {
  const saved = useRef(null)
  return payload => {
    const fingerprint = JSON.stringify(payload)
    if (saved.current?.fingerprint !== fingerprint) saved.current = { fingerprint, id: crypto.randomUUID() }
    return saved.current.id
  }
}
export const topicLabels = { general: 'General making', '3d-printing': '3D printing', cad: 'CAD & design', electronics: 'Electronics', coding: 'Coding' }
export const statusLabels = { pending: 'Awaiting review', approved: 'Published', rejected: 'Changes requested', hidden: 'Hidden by moderator', withdrawn: 'Withdrawn' }
