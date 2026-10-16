import { readFileSync } from 'fs'
import path from 'path'
import { vetHtmlSim } from '../sims/vetHtmlSim.js'

// Locked down: no network, no external resources, opaque-origin sandbox (no cookies, storage or parent access).
export const HTML_SIM_CSP = [
  "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", "img-src data: blob:", "font-src data:",
  "media-src data: blob:", "connect-src 'none'", "worker-src 'none'", "frame-src 'none'", "object-src 'none'", "form-action 'none'",
  "base-uri 'none'", "frame-ancestors 'self'", 'sandbox allow-scripts allow-pointer-lock',
].join('; ')

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function readHtmlSim(id, dir = path.join(process.cwd(), 'content', 'sims', 'html')) {
  if (!SAFE_ID.test(id)) return null
  let html
  try { html = readFileSync(path.join(dir, `${id}.html`), 'utf8') } catch { return null }
  return vetHtmlSim(html).ok ? html : null // fail closed if a file was changed after vetting
}

export function htmlSimResponse(html) {
  return new Response(html, { status: 200, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': HTML_SIM_CSP,
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-read=()',
  } })
}
