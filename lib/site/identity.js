// FIT identity line shown on every request flow, confirmation page and customer email.
// Plain selectable text with a real link. No physical address until the PM confirms one: pass `address` then.
export const FIT_NAME = 'Fix It Today'
export const FIT_URL = 'https://www.fixitoday.com'
export const FIT_HOST = 'www.fixitoday.com'

const clean = value => (typeof value === 'string' ? value.trim() : '')
const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function fitAddressLineText({ address } = {}) {
  return [FIT_NAME, FIT_HOST, clean(address)].filter(Boolean).join(', ')
}

export function fitAddressLineEmailHtml({ address, color = 'inherit' } = {}) {
  const extra = clean(address) ? `, ${esc(clean(address))}` : ''
  return `<span data-fit-address-line>${FIT_NAME}, <a href="${FIT_URL}" target="_blank" style="color:${esc(color)};">${FIT_HOST}</a>${extra}</span>`
}