/**
 * Pure email partial: the customer's own model(s) with a drawn MODEL preview (never a photo of a finished print), and each model's saved quantity, material, colour and price.
 * No I/O. Table markup with inline CSS only. Every value is escaped, and only a preview that was prepared for THIS request and THIS customer is rendered as an image
 * (as a `cid:` reference to an attachment on the same message): no URL, storage key or data URL is ever emitted. Anything else shows "Model preview unavailable".
 *
 * `models` is the customer-audience result of `buildOrderModelView(...).models`; `previews` maps model id -> the entry made by `prepareNudgePreviews`.
 */
import { esc } from '@/lib/email/template'

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const BORDER = '#e6e6e6', MUTED = '#67696b', TEXT = '#111111', SURFACE = '#fcfcfc'
export const PREVIEW_CAPTION = 'Model preview — not a photograph of the finished print.'
export const PREVIEW_UNAVAILABLE = 'Model preview unavailable'
const UNAVAILABLE_NOTES = {
  unsupported: 'This file type cannot be previewed.',
  missing: 'The file is not available to preview.',
  too_large: 'This file is too large to preview.',
  unreadable: 'This file could not be read as a model.',
  not_included: 'Not previewed in this email.',
  timeout: 'The preview took too long to prepare.',
}
const CID = /^[A-Za-z0-9._-]{1,120}@[A-Za-z0-9.-]{1,120}$/
const cut = (value, n) => { const s = String(value ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s }

/** Only a ready preview that belongs to this request, this customer AND this model, with sane dimensions, counts. */
export function usablePreview(preview, request, model) {
  if (!preview || preview.status !== 'ready') return null
  if (!model || preview.modelId !== model.id) return null
  if (!request?.requestId || preview.requestId !== request.requestId || !request.userId || preview.ownerUserId !== request.userId) return null
  if (!CID.test(String(preview.cid || ''))) return null
  if (!Number.isInteger(preview.width) || !Number.isInteger(preview.height) || preview.width < 1 || preview.height < 1 || preview.width > 1200 || preview.height > 1200) return null
  return preview
}

const choice = (value, helpText) => (value?.state === 'specified' ? cut(value.text, 140) : value?.state === 'help' ? helpText : 'Not provided')
const amount = (n, currency) => `${String(currency || '').toUpperCase()} ${Number(n).toFixed(2)}`.trim()

export function modelPriceText(price) {
  if (!price) return 'Not quoted'
  if (price.state === 'recorded') return `${amount(price.unit, price.currency)} each × ${price.quantity} = ${amount(price.amount, price.currency)}${price.mismatch ? ` (priced for ${price.quantity}; your request now lists ${price.requestQuantity})` : ''}`
  if (price.state === 'ambiguous') return 'Price not available for this file'
  if (price.state === 'quoted') return `${amount(price.amount, price.currency)} (quote for this order)`
  if (price.state === 'not_allocated') return 'Not split per model'
  return 'Not quoted yet'
}

const factRow = ([label, value]) => `
        <tr>
          <td style="padding:4px 12px 4px 0;font-family:${FONT};font-size:13px;color:${MUTED};vertical-align:top;white-space:nowrap;">${esc(label)}</td>
          <td style="padding:4px 0;font-family:${FONT};font-size:13px;color:${TEXT};font-weight:600;vertical-align:top;">${esc(value)}</td>
        </tr>`

function pictureCell(model, preview, request) {
  const ok = usablePreview(preview, request, model)
  if (ok) {
    const alt = `Model preview of ${model.label}. Not a photograph of the finished print.`
    return `<img src="cid:${esc(ok.cid)}" alt="${esc(alt)}" width="${ok.width}" height="${ok.height}" style="display:block;border:0;width:100%;max-width:${ok.width}px;height:auto;border-radius:8px;background:#f4f2ee;" />
          <div style="font-family:${FONT};font-size:11px;color:${MUTED};padding-top:4px;">${esc(PREVIEW_CAPTION)}</div>`
  }
  const note = UNAVAILABLE_NOTES[preview?.reason] || ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px dashed ${MUTED};border-radius:8px;background:#f4f2ee;"><tr><td align="center" style="padding:28px 12px;font-family:${FONT};font-size:13px;color:${MUTED};">${esc(PREVIEW_UNAVAILABLE)}${note ? `<br />${esc(note)}` : ''}</td></tr></table>`
}

export function modelPreviewBlock({ request, models, previews } = {}) {
  if (!Array.isArray(models) || !models.length) return ''
  const multi = models.length > 1
  const shared = multi && models.some(m => m.material?.scope === 'all' || m.colour?.scope === 'all')
  const cards = models.map((model, index) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0;border:1px solid ${BORDER};border-radius:8px;background:${SURFACE};">
    <tr><td style="padding:12px 14px 4px 14px;">${pictureCell(model, previews?.[model.id], request)}</td></tr>
    <tr><td style="padding:6px 14px 2px 14px;font-family:${FONT};font-size:14px;font-weight:700;color:${TEXT};word-break:break-word;">${esc(multi ? `${index + 1}. ` : '')}${esc(model.label)}</td></tr>
    <tr><td style="padding:2px 14px 12px 14px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${[
        ['Quantity', model.quantity != null ? String(model.quantity) : 'Not provided'],
        ['Material', choice(model.material, 'Help choosing requested')],
        ['Colour', choice(model.colour, 'Help choosing requested')],
        ['Price', modelPriceText(model.price)],
      ].map(factRow).join('')}
      </table>
    </td></tr>
  </table>`).join('')
  const intro = multi ? `Your ${models.length} models` : 'Your model'
  const notes = [
    'Previews are drawn from the files you uploaded. The finished print can look different.',
    shared ? 'Material and colour apply to every model in this request.' : '',
  ].filter(Boolean).map(t => `<p style="margin:0 0 6px 0;font-family:${FONT};font-size:12px;color:${MUTED};">${esc(t)}</p>`).join('')
  return `
  <h2 style="margin:18px 0 10px 0;font-family:${FONT};font-size:16px;font-weight:700;color:${TEXT};">${esc(intro)}</h2>${cards}${notes}`
}
