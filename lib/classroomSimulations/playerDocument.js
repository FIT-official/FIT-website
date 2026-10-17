import { getLiveSim } from '../sims/registry.js'
import { injectNoTapZoom, SIM_VIEWPORT } from '../sims/noTapZoom.js'

const escapeHtml = value => value.replace(/[&<>\"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character])

// Pure public document: never reads accounts, class records or environment keys.
export function playerDocument(id, { embed = false } = {}) {
  const activity = getLiveSim(id)
  if (!activity || activity.kind === 'html') return null // single-file HTML sims are served by htmlSimDocument
  const stylesheet = activity.kind === 'game' ? '/simulations/games/games.css' : activity.kind === 'family' ? '/simulations/families/shell.css' : '/simulations/lab.css'
  const script = activity.kind === 'game' ? '/simulations/games/main.js' : activity.kind === 'family' ? '/simulations/families/main.js' : '/simulations/lab.js'
  return injectNoTapZoom(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="${SIM_VIEWPORT}"><meta name="description" content="${escapeHtml(activity.description)}"><title>${escapeHtml(activity.title)} | FIT</title><link rel="stylesheet" href="${stylesheet}"></head><body data-activity="${activity.id}"${embed ? ' class="embed"' : ''}><noscript>This activity needs JavaScript. Enable it to run the model.</noscript><div id="app"></div><script type="module" src="${script}"></script></body></html>`)
}
