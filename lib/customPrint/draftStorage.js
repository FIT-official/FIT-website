// The request page keeps an unsaved draft (choices, note, delivery, address,
// never the file) in sessionStorage so a full-page sign-in redirect does not
// throw the customer's work away. Storage may be unavailable or blocked, so
// every access is guarded.
export const DRAFT_STORAGE_KEY = 'fit:print-request-draft'

function storage() {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null } catch { return null }
}

export function readStoredDraft() {
  try {
    const raw = storage()?.getItem(DRAFT_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch { return null }
}

export function writeStoredDraft(draft) {
  try { storage()?.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft)) } catch { /* storage blocked */ }
}

export function clearStoredDraft() {
  try { storage()?.removeItem(DRAFT_STORAGE_KEY) } catch { /* storage blocked */ }
}
