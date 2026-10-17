import { fitAddressLineEmailHtml } from '../site/identity.js'
/**
 * Pure, on-brand email base layout + partials. No I/O — strings in, HTML out —
 * so the content is unit-testable without nodemailer or credentials.
 *
 * Matches the storefront design system: light theme (#fefefe bg, #111 text,
 * #67696b muted, #e6e6e6 hairlines, #fcfcfc surfaces), Inter font stack with
 * safe fallbacks, rounded cards, amber→red gradient CTA. Email clients ignore
 * <style>/external CSS and strip many properties, so everything is inline and
 * table-based.
 */

const COLORS = Object.freeze({
  bg: '#fefefe',
  surface: '#fcfcfc',
  text: '#111111',
  muted: '#67696b',
  border: '#e6e6e6',
})

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const SITE_URL = 'https://www.fixitoday.com'
const CONTACT_EMAIL = 'fixittoday.contact@gmail.com'

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function money(amount, currency = 'sgd') {
  const n = Number(amount)
  const safe = Number.isFinite(n) ? n : 0
  return `${String(currency || 'sgd').toUpperCase()} ${safe.toFixed(2)}`
}

/**
 * Amber→red gradient call-to-action button. Email clients that drop gradients
 * fall back to the solid background-color, so set a sensible mid-tone.
 */
export function ctaButton({ href, label }) {
  if (!href) return ''
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td align="center" bgcolor="#f0883e" style="border-radius:9999px;background-color:#f0883e;background-image:linear-gradient(135deg,#fcd34d,#f87171);">
        <a href="${esc(href)}" target="_blank"
           style="display:inline-block;padding:12px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#111111;text-decoration:none;border-radius:9999px;">
          ${esc(label || 'View')}
        </a>
      </td>
    </tr>
  </table>`
}

/**
 * Simple label/value card. `rows` is an array of [label, value]; empty/nullish
 * values are dropped.
 */
export function infoTable(rows = []) {
  const cells = (rows || [])
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:6px 0;font-family:${FONT};font-size:13px;color:${COLORS.muted};">${esc(label)}</td>
        <td align="right" style="padding:6px 0;font-family:${FONT};font-size:13px;color:${COLORS.text};font-weight:600;">${esc(value)}</td>
      </tr>`,
    )
    .join('')
  if (!cells) return ''
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="margin:16px 0;border:1px solid ${COLORS.border};border-radius:8px;background:${COLORS.surface};padding:8px 16px;">
    ${cells}
  </table>`
}

/**
 * Itemized quote/charge breakdown: one row per line plus a bold total. `lines`
 * is `[{ label, amount }]`; the partial is shared by quote-ready and payment
 * emails so the customer sees a consistent breakdown.
 */
export function breakdownTable({ lines = [], total, currency = 'sgd', totalLabel = 'Total' } = {}) {
  const rows = (lines || [])
    .filter((l) => l && (Number(l.amount) > 0 || l.always))
    .map(
      (l) => `
      <tr>
        <td style="padding:7px 0;border-bottom:1px solid ${COLORS.border};font-family:${FONT};font-size:14px;color:${COLORS.muted};">${esc(l.label)}</td>
        <td align="right" style="padding:7px 0;border-bottom:1px solid ${COLORS.border};font-family:${FONT};font-size:14px;color:${COLORS.text};white-space:nowrap;">${esc(money(l.amount, currency))}</td>
      </tr>`,
    )
    .join('')

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="margin:16px 0;border:1px solid ${COLORS.border};border-radius:8px;background:${COLORS.surface};padding:8px 16px;">
    ${rows}
    <tr>
      <td style="padding:10px 0 4px 0;font-family:${FONT};font-size:15px;color:${COLORS.text};font-weight:700;">${esc(totalLabel)}</td>
      <td align="right" style="padding:10px 0 4px 0;font-family:${FONT};font-size:15px;color:${COLORS.text};font-weight:700;white-space:nowrap;">${esc(money(total, currency))}</td>
    </tr>
  </table>`
}

/**
 * Wrap a body fragment in the full branded document. `preheader` is the hidden
 * inbox-preview snippet.
 *
 * @returns {string} complete HTML email
 */
export function emailLayout({ title = 'Fix It Today', preheader = '', bodyHtml = '' } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.border};">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${esc(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.border};padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
          style="max-width:600px;width:100%;background:${COLORS.bg};border:1px solid ${COLORS.border};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid ${COLORS.border};">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="padding-right:10px;">
                  <img src="${SITE_URL}/logo-mark.svg" alt="Fix It Today" width="28" height="28" style="display:block;" />
                </td>
                <td style="font-family:${FONT};font-size:18px;font-weight:700;color:${COLORS.text};">Fix It Today</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;font-family:${FONT};font-size:15px;line-height:1.6;color:${COLORS.text};">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid ${COLORS.border};font-family:${FONT};font-size:12px;line-height:1.6;color:${COLORS.muted};">
              You're receiving this because you have an order or account with Fix It Today.<br />
              ${fitAddressLineEmailHtml({ color: COLORS.muted })}
              &nbsp;·&nbsp;
              <a href="mailto:${CONTACT_EMAIL}" style="color:${COLORS.muted};">${CONTACT_EMAIL}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Small helper: a heading + paragraph(s) body fragment. */
export function bodyBlock({ heading, paragraphs = [] } = {}) {
  const head = heading
    ? `<h1 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:${COLORS.text};">${esc(heading)}</h1>`
    : ''
  const paras = (paragraphs || [])
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px 0;">${p}</p>`)
    .join('')
  return head + paras
}

export { SITE_URL, CONTACT_EMAIL }
