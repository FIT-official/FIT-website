import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { emptyDocument } from '@/lib/researchProjects/shared'
import { requestJson, recordsUrl, keysUrl, RECORDS_ENDPOINT, ACTIONS_ENDPOINT, NetworkError, isAbort } from './api'

// Student record controller: load, edit, autosave, explicit conflict handling, submit, keys.
//
// Guards against lost or misattributed work:
//  - every response is checked against the signed-in viewer key; a mismatch means the account
//    changed, so the result is discarded and saving stops until the page is reloaded
//  - a new load aborts the previous one, and late responses from older requests are ignored
//  - saves are sequential and carry the revision they were based on; a 409 never overwrites
//  - unsaved edits are mirrored to this browser (keyed by viewer) so a refresh or crash keeps them

const AUTOSAVE_MS = 1500
const EDITABLE = ['draft', 'revision_requested']

const stableStringify = value => {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}'
  return JSON.stringify(value)
}

const backupKey = (viewer, slug) => `researchProjects:v1:${viewer}:${slug}`

function readBackup(viewer, slug) {
  try {
    const raw = window.localStorage.getItem(backupKey(viewer, slug))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeBackup(viewer, slug, value) {
  try {
    if (value) window.localStorage.setItem(backupKey(viewer, slug), JSON.stringify(value))
    else window.localStorage.removeItem(backupKey(viewer, slug))
  } catch {
    // Storage can be unavailable (private mode, quota). Server saves still work.
  }
}

export function describeDifference(a, b) {
  const parts = []
  const planChanged = Object.keys({ ...a.plan, ...b.plan }).filter(k => (a.plan?.[k] || '') !== (b.plan?.[k] || ''))
  if (planChanged.length) parts.push(`${planChanged.length} plan field${planChanged.length === 1 ? '' : 's'}`)
  const answerIds = new Set([...Object.keys(a.answers || {}), ...Object.keys(b.answers || {})])
  const answersChanged = [...answerIds].filter(id => stableStringify(a.answers?.[id]) !== stableStringify(b.answers?.[id]))
  if (answersChanged.length) parts.push(`${answersChanged.length} answer${answersChanged.length === 1 ? '' : 's'}`)
  if (stableStringify(a.dataset) !== stableStringify(b.dataset)) parts.push(`data table (${(a.dataset || []).length} rows here, ${(b.dataset || []).length} there)`)
  if (stableStringify(a.todo) !== stableStringify(b.todo)) parts.push('to-do ticks')
  return parts
}

export function useProjectRecord({ slug, viewer }) {
  const [phase, setPhase] = useState('loading') // loading | ready | error | denied | account
  const [server, setServer] = useState(null)
  const [doc, setDoc] = useState(emptyDocument)
  const [sync, setSync] = useState('saved') // saved | saving | offline | error | conflict | locked | account
  const [conflict, setConflict] = useState(null)
  const [message, setMessage] = useState('')
  const [problems, setProblems] = useState([])
  const [online, setOnline] = useState(true)

  const docRef = useRef(doc)
  const serverRef = useRef(null)
  const syncRef = useRef('saved')
  const epoch = useRef(0)
  const loadCtl = useRef(null)
  const saving = useRef(false)
  const mounted = useRef(true)

  const setSyncState = useCallback(value => { syncRef.current = value; setSync(value) }, [])
  const setDocBoth = useCallback(value => { docRef.current = value; setDoc(value) }, [])
  const setServerBoth = useCallback(value => { serverRef.current = value; setServer(value) }, [])

  const dirty = useMemo(() => (server ? stableStringify(doc) !== stableStringify(server.doc) : false), [doc, server])
  const editable = !!server && EDITABLE.includes(server.status) && sync !== 'conflict' && sync !== 'account' && phase === 'ready'

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      epoch.current += 1
      loadCtl.current?.abort()
    }
  }, [])

  // ---- loading ----
  const load = useCallback(async () => {
    loadCtl.current?.abort()
    const ctl = new AbortController()
    loadCtl.current = ctl
    const mine = ++epoch.current
    const current = () => epoch.current === mine && !ctl.signal.aborted
    setPhase(p => (p === 'ready' ? p : 'loading'))
    try {
      const r = await requestJson('GET', recordsUrl(slug), { signal: ctl.signal })
      if (!current()) return
      if (r.status === 401 || r.status === 403) { setPhase('denied'); setMessage(r.data?.error || 'This account cannot open the library.'); return }
      if (!r.ok) { setPhase('error'); setMessage(r.data?.error || 'The record could not be loaded.'); return }
      if (r.data.viewer !== viewer) { setPhase('account'); setSyncState('account'); setMessage('You are signed in as a different account than this page was opened for. Reload to continue.'); return }
      const record = r.data.record
      setServerBoth(record)
      const backup = readBackup(viewer, slug)
      if (backup && stableStringify(backup.doc) !== stableStringify(record.doc)) {
        if (backup.base === record.revision && EDITABLE.includes(record.status)) {
          setDocBoth(backup.doc)
          setSyncState('saved')
          setMessage('Restored unsaved edits from this device.')
        } else {
          setDocBoth(record.doc)
          setConflict({ current: record, mine: backup.doc, origin: 'device' })
          setSyncState('conflict')
          setMessage('Unsaved edits on this device were made on an older version of the record.')
        }
      } else {
        setDocBoth(record.doc)
        setSyncState('saved')
        setMessage('')
        if (backup) writeBackup(viewer, slug, null)
      }
      setPhase('ready')
    } catch (error) {
      if (isAbort(error) || !current()) return
      setPhase('error')
      setMessage(error instanceof NetworkError ? 'You appear to be offline, or the service is unreachable.' : 'The record could not be loaded.')
    }
  }, [slug, viewer, setServerBoth, setDocBoth, setSyncState])

  useEffect(() => { load() }, [load])

  // ---- online/offline ----
  useEffect(() => {
    const on = () => {
      setOnline(true)
      // Back online: let the normal autosave retry whatever failed while offline.
      if (syncRef.current === 'offline') setSyncState('saved')
    }
    const off = () => setOnline(false)
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine !== false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [setSyncState])

  // ---- quiet refresh when the tab regains focus ----
  // Picks up teacher actions (safety review, feedback, key release) made while this page sat open.
  // Skipped whenever there are unsaved edits or a save is running, so it can never replace typing.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden' || saving.current) return
      if (phase !== 'ready' || !serverRef.current || syncRef.current !== 'saved') return
      if (stableStringify(docRef.current) !== stableStringify(serverRef.current.doc)) return
      load()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [phase, load])

  // ---- local backup of unsaved edits ----
  useEffect(() => {
    if (phase !== 'ready' || !server || syncRef.current === 'account') return
    if (dirty) writeBackup(viewer, slug, { base: server.revision, doc, at: Date.now() })
    else if (sync !== 'conflict') writeBackup(viewer, slug, null)
  }, [dirty, doc, server, phase, viewer, slug, sync])

  // ---- editing ----
  const edit = useCallback(updater => {
    if (!serverRef.current || !EDITABLE.includes(serverRef.current.status)) return
    if (syncRef.current === 'conflict' || syncRef.current === 'account') return
    const next = updater(docRef.current)
    setDocBoth(next)
    if (syncRef.current === 'saved' || syncRef.current === 'locked') setSyncState('saved')
  }, [setDocBoth, setSyncState])

  // ---- saving ----
  const applyFailure = useCallback((r) => {
    const data = r.data || {}
    if (r.status === 409 && data.code === 'account_changed') { setSyncState('account'); setMessage(data.error); return }
    if (r.status === 409 && data.current) { setConflict({ current: data.current, mine: docRef.current, origin: 'save' }); setSyncState('conflict'); setMessage(data.error || 'The record changed.'); return }
    if (r.status === 409) { setSyncState('error'); setMessage(data.error || 'The record changed. Reload to continue.'); return }
    if (r.status === 423 && data.current) { setServerBoth(data.current); setSyncState('locked'); setMessage(data.error); return }
    if (r.status === 401 || r.status === 403) { setSyncState('error'); setMessage('Your session ended. Sign in again; your edits are kept on this device.'); return }
    setSyncState('error')
    setMessage(data.error || 'The record could not be saved.')
  }, [setSyncState, setServerBoth])

  const saveNow = useCallback(async () => {
    if (saving.current) return false
    const base = serverRef.current
    if (!base || !EDITABLE.includes(base.status)) return false
    if (syncRef.current === 'conflict' || syncRef.current === 'account') return false
    const sent = docRef.current
    if (stableStringify(sent) === stableStringify(base.doc)) return true
    const mine = epoch.current
    saving.current = true
    setSyncState('saving')
    setMessage('')
    setProblems([])
    try {
      const r = await requestJson('PUT', RECORDS_ENDPOINT, { body: { slug, viewer, baseRevision: base.revision, doc: sent } })
      if (!mounted.current || epoch.current !== mine) return false
      if (!r.ok) { applyFailure(r); return false }
      if (r.data.viewer !== viewer) { setSyncState('account'); setMessage('The account changed while saving. Reload before continuing.'); return false }
      setServerBoth(r.data.record)
      // Adopt the server's normalised copy unless the person kept typing during the save.
      if (stableStringify(docRef.current) === stableStringify(sent)) setDocBoth(r.data.record.doc)
      setSyncState('saved')
      return true
    } catch (error) {
      if (!mounted.current || isAbort(error)) return false
      setSyncState(error instanceof NetworkError ? 'offline' : 'error')
      setMessage(error instanceof NetworkError ? 'Offline: your changes are kept on this device and will save when you reconnect.' : 'The record could not be saved.')
      return false
    } finally {
      saving.current = false
    }
  }, [slug, viewer, applyFailure, setServerBoth, setDocBoth, setSyncState])

  // Autosave after a pause; retried automatically when the browser comes back online.
  useEffect(() => {
    if (phase !== 'ready' || !dirty || !editable || !online) return undefined
    if (sync === 'saving' || sync === 'error' || sync === 'locked' || sync === 'offline') return undefined
    const t = setTimeout(() => { saveNow() }, AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [phase, dirty, editable, online, sync, doc, saveNow])

  // ---- submit ----
  const submit = useCallback(async () => {
    if (!serverRef.current) return false
    setProblems([])
    if (stableStringify(docRef.current) !== stableStringify(serverRef.current.doc)) {
      const ok = await saveNow()
      if (!ok) return false
    }
    if (saving.current) return false
    saving.current = true
    const mine = epoch.current
    setSyncState('saving')
    try {
      const r = await requestJson('POST', ACTIONS_ENDPOINT, { body: { slug, viewer, action: 'submit', baseRevision: serverRef.current.revision } })
      if (!mounted.current || epoch.current !== mine) return false
      if (r.ok && r.data.viewer === viewer) { setServerBoth(r.data.record); setSyncState('saved'); setMessage('Submitted for review.'); return true }
      if (r.status === 422 && r.data?.problems) { setSyncState('saved'); setProblems(r.data.problems); setMessage(r.data.error); return false }
      applyFailure(r)
      return false
    } catch (error) {
      if (!mounted.current || isAbort(error)) return false
      setSyncState(error instanceof NetworkError ? 'offline' : 'error')
      setMessage(error instanceof NetworkError ? 'Offline: submit again when you reconnect.' : 'The record could not be submitted.')
      return false
    } finally {
      saving.current = false
    }
  }, [slug, viewer, saveNow, applyFailure, setServerBoth, setSyncState])

  // ---- explicit conflict resolution ----
  const acceptTheirs = useCallback(() => {
    if (!conflict) return
    setServerBoth(conflict.current)
    setDocBoth(conflict.current.doc)
    writeBackup(viewer, slug, null)
    setConflict(null)
    setSyncState('saved')
    setMessage('Loaded the latest saved record. Your unsaved edits were discarded because you chose to.')
  }, [conflict, viewer, slug, setServerBoth, setDocBoth, setSyncState])

  const keepMine = useCallback(() => {
    if (!conflict) return
    setServerBoth(conflict.current)
    setDocBoth(conflict.mine)
    setConflict(null)
    setSyncState('saved')
    setMessage('Your edits were kept. They will save on top of the latest record when you press Save or after a pause.')
  }, [conflict, setServerBoth, setDocBoth, setSyncState])

  return {
    phase, server, doc, edit, sync, dirty, editable, online, conflict, message, problems,
    saveNow, submit, reload: load, acceptTheirs, keepMine,
  }
}

// Answer-key fetch, only used when the server says release is allowed (teacher, or released record).
export function useKeys(slug, query = '') {
  const [state, setState] = useState({ status: 'idle', keys: null, auto: {}, message: '' })
  const epoch = useRef(0)
  const ctl = useRef(null)
  useEffect(() => () => { epoch.current += 1; ctl.current?.abort() }, [])
  // A different record (or class) means any key or auto-check already shown belongs to the wrong one.
  useEffect(() => {
    epoch.current += 1
    ctl.current?.abort()
    setState({ status: 'idle', keys: null, auto: {}, message: '' })
  }, [slug, query])
  const load = useCallback(async () => {
    ctl.current?.abort()
    const c = new AbortController()
    ctl.current = c
    const mine = ++epoch.current
    setState(s => ({ ...s, status: 'loading', message: '' }))
    try {
      const r = await requestJson('GET', keysUrl(slug, query), { signal: c.signal })
      if (epoch.current !== mine) return
      if (r.ok) setState({ status: 'ready', keys: r.data.keys, auto: r.data.auto || {}, message: '' })
      else setState({ status: 'denied', keys: null, auto: {}, message: r.data?.error || 'Answer keys are not available.' })
    } catch (error) {
      if (isAbort(error) || epoch.current !== mine) return
      setState({ status: 'error', keys: null, auto: {}, message: 'Could not load the answer key. Check your connection and retry.' })
    }
  }, [slug, query])
  const clear = useCallback(() => { epoch.current += 1; ctl.current?.abort(); setState({ status: 'idle', keys: null, auto: {}, message: '' }) }, [])
  return { ...state, load, clear }
}
