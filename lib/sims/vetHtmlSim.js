// Vet a ChatGPT-generated single-file HTML sim before integration.
// Used by tests (every content/sims/html/*.html) and by scripts/vet-html-sim.mjs before integration.
export function vetHtmlSim(html) {
  const block = [], warn = []
  const size = Buffer.byteLength(html)
  if (size > 1_500_000) block.push(`too large: ${size} bytes`)
  if (!/^\s*<!doctype html>/i.test(html)) warn.push('missing <!doctype html>')
  if (!/<meta[^>]+name=["']viewport/i.test(html)) block.push('no viewport meta (mobile)')
  const ext = [...html.matchAll(/(?:src|href|action|url\()\s*=?\s*["']?\s*((?:https?:)?\/\/[^"')\s>]+)/gi)].map(m => m[1])
  if (ext.length) block.push('external resources: ' + [...new Set(ext)].slice(0, 5).join(', '))
  for (const [re, what] of [[/\bfetch\s*\(/, 'fetch()'], [/XMLHttpRequest/, 'XMLHttpRequest'], [/new\s+WebSocket/, 'WebSocket'], [/EventSource/, 'EventSource'], [/navigator\.sendBeacon/, 'sendBeacon'], [/\beval\s*\(/, 'eval()'], [/new\s+Function\s*\(/, 'new Function()'], [/\bimport\s*\(/, 'dynamic import()'], [/<script[^>]+src=/i, 'external <script src>'], [/<iframe/i, 'nested iframe'], [/<form/i, 'form'], [/document\.cookie/, 'document.cookie'], [/(local|session)Storage/, 'web storage'], [/indexedDB/, 'indexedDB'], [/window\.(top|parent)\.location/, 'top navigation'], [/serviceWorker/, 'service worker']])
    if (re.test(html)) block.push('forbidden API: ' + what)
  if (/\b(NUS|NTU)\b|\b[A-Z]{2}\d{4}[A-Z]?\b/.test(html.replace(/<script[\s\S]*?<\/script>/gi, ''))) warn.push('possible university module code in visible text')
  if (/phet/i.test(html)) block.push('mentions PhET (originals only)')
  if (!/<canvas|<svg/i.test(html)) warn.push('no canvas/svg graphics found')
  return { ok: block.length === 0, size, block, warn }
}
