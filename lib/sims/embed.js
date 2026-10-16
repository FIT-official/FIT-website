import { getLiveSim } from './registry.js'

const escapeAttribute = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])

export function getEmbedPath(id) {
  return getLiveSim(id) ? `/embed/sims/${id}` : null
}

export function createEmbedSnippet(id, origin) {
  const activity = getLiveSim(id)
  if (!activity) throw new Error('Unknown live simulation')
  const url = new URL(origin)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS origin')
  const source = `${url.origin}${getEmbedPath(id)}`
  return `<iframe src="${escapeAttribute(source)}" title="${escapeAttribute(`FIT: ${activity.title}`)}" width="100%" height="1400" style="border:0;border-radius:16px" loading="lazy" referrerpolicy="no-referrer" allowfullscreen></iframe>`
}
