import { findActivity } from '../../public/simulations/catalog.js'

const escapeHtml = value => value.replace(/[&<>\"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character])

// Pure public document: never reads accounts, class records or environment keys.
export function playerDocument(id) {
  const activity = findActivity(id)
  if (!activity) return null
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHtml(activity.description)}"><title>${escapeHtml(activity.title)} | FIT</title><link rel="stylesheet" href="/simulations/lab.css"></head><body data-activity="${activity.id}"><noscript>This activity needs JavaScript. Enable it to run the model.</noscript><div id="app"></div><script type="module" src="/simulations/lab.js"></script></body></html>`
}
