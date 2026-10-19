// Phase 1: the join box only checks that what was typed LOOKS like a code. It does not send, check or save anything, and it
// says so. Phase 2 must supply the real contract: server-issued codes scoped to one teacher-created session, expiry,
// per-IP/per-code rate limits, a lookup that never reveals whether a code belonged to another class, and student authority
// derived on the server. Nothing here may be treated as a session join.
export const JOIN_CODE_MIN = 4
export const JOIN_CODE_MAX = 12
export function normaliseJoinCode(raw) {
  if (typeof raw !== 'string') return ''
  return raw.normalize('NFKC').replace(/[\s-]+/g, '').toUpperCase()
}
export function checkJoinCodeShape(raw) {
  const code = normaliseJoinCode(raw)
  if (!code) return { ok: false, message: 'Enter the code your teacher gave you.' }
  if (!/^[A-Z0-9]+$/.test(code)) return { ok: false, message: 'Codes use letters and numbers only.' }
  if (code.length < JOIN_CODE_MIN || code.length > JOIN_CODE_MAX) return { ok: false, message: `Codes are ${JOIN_CODE_MIN} to ${JOIN_CODE_MAX} letters or numbers.` }
  return { ok: true, code }
}
