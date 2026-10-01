import { validateEntry } from './policy'
const key = (kind, subject, actor) => 'fit.community.pending.' + kind + '.' + subject + '.' + actor
export function saveCommunityPending(storage, kind, subject, actor, payload, now = Date.now()) {
  try { storage.setItem(key(kind, subject, actor), JSON.stringify({ payload, at: now, actor })) } catch { /* The stable retry remains in memory. */ }
}
export function clearCommunityPending(storage, kind, subject, actor) {
  try { storage.removeItem(key(kind, subject, actor)) } catch { /* Browser storage is optional. */ }
}
export function readCommunityPending(storage, kind, subject, actor, now = Date.now()) {
  try {
    const saved = JSON.parse(storage.getItem(key(kind, subject, actor)))
    if (!saved) return null
    if (saved.actor !== actor || !Number.isFinite(saved.at) || saved.at > now || now - saved.at > 3600000 || saved.payload?.subject !== subject ||
      ![kind, ...(kind === 'shop_review' ? ['shop_reply'] : [])].includes(saved.payload?.kind) || validateEntry(saved.payload).error) {
      clearCommunityPending(storage, kind, subject, actor); return null
    }
    return saved.payload
  } catch { return null }
}
