// Shared email-safe presentation. Inline tables work without CSS support;
// media rules only improve narrow screens and clients supporting dark mode.
export const SITE_URL = 'https://www.fixitoday.com'
export const CONTACT_EMAIL = 'fixittoday.contact@gmail.com'
const FONT = 'Arial, Helvetica, sans-serif'
export const EMAIL_COLORS = Object.freeze({ bg: '#f3f4f6', card: '#ffffff', ink: '#17202a', muted: '#56616f', line: '#d9dee5', accent: '#f4b321' })
export function esc(value) { return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
export function money(amount,currency='sgd') {
  if (amount == null || amount === '' || !Number.isFinite(Number(amount))) return 'Not recorded'
  return `${String(currency || 'sgd').toUpperCase()} ${Number(amount).toFixed(2)}`
}
function safeHref(value) {
  try { const u=new URL(value);return ['https:','mailto:'].includes(u.protocol) ? u.href : '' } catch { return '' }
}
export function ctaButton({href,label}) {
  const link=safeHref(href);if(!link)return ''
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td class="fit-cta" bgcolor="#f4b321" style="background:#f4b321;border:1px solid #f4b321;border-radius:8px;mso-padding-alt:14px 24px;text-align:center"><a href="${esc(link)}" target="_blank" style="display:inline-block;padding:14px 24px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:700;color:#17202a;text-decoration:none;word-break:break-word">${esc(label||'View details')}</a></td></tr></table>`
}
export function infoTable(rows=[]) {
  const content=rows.filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([label,value])=>`<tr><td class="fit-muted" valign="top" style="width:35%;padding:10px 12px 10px 0;border-bottom:1px solid #d9dee5;font:14px/1.5 ${FONT};color:#56616f;overflow-wrap:anywhere;word-break:break-word">${esc(label)}</td><td class="fit-ink" valign="top" style="padding:10px 0;border-bottom:1px solid #d9dee5;font:15px/1.5 ${FONT};color:#17202a;overflow-wrap:anywhere;word-break:break-word">${esc(value)}</td></tr>`).join('')
  return content?`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 20px;table-layout:fixed;border-collapse:collapse">${content}</table>`:''
}
export function breakdownTable({lines=[],total,currency='sgd',totalLabel='Total'}={}) {
  const rows=lines.filter(l=>l&&(Number(l.amount)>0||l.always)).map(l=>`<tr><td class="fit-muted" style="padding:9px 8px 9px 0;border-bottom:1px solid #d9dee5;color:#56616f;font-size:15px;word-break:break-word">${esc(l.label)}</td><td class="fit-ink" align="right" style="width:120px;padding:9px 0;border-bottom:1px solid #d9dee5;color:#17202a;font-size:15px;white-space:nowrap">${esc(money(l.amount,currency))}</td></tr>`).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;font-family:${FONT};table-layout:fixed;border-collapse:collapse">${rows}<tr><td class="fit-ink" style="padding:16px 8px 4px 0;color:#17202a;font-size:17px;font-weight:700">${esc(totalLabel)}</td><td class="fit-ink" align="right" style="width:120px;padding:16px 0 4px;color:#17202a;font-size:18px;font-weight:700;white-space:nowrap">${esc(money(total,currency))}</td></tr></table>`
}
export function bodyBlock({heading,paragraphs=[]}={}) {
  return (heading?`<h1 class="fit-ink" style="margin:0 0 18px;font:700 26px/1.25 ${FONT};letter-spacing:-0.4px;color:#17202a;word-break:break-word">${esc(heading)}</h1>`:'')+paragraphs.filter(Boolean).map(p=>`<p style="margin:0 0 14px;overflow-wrap:anywhere;word-break:break-word">${p}</p>`).join('')
}
export function referenceFooter(reference,detailsUrl) {
  if(!reference)return ''
  const link=safeHref(detailsUrl)
  return `<div class="fit-muted" style="margin-top:24px;padding-top:16px;border-top:1px solid #d9dee5;color:#56616f;font:12px/1.6 ${FONT}">Reference<br><span style="font-family:Consolas,monospace;font-size:12px;word-break:break-all;overflow-wrap:anywhere;user-select:text">${esc(reference)}</span>${link?`<br><a class="fit-link" href="${esc(link)}" style="color:#354c66;text-decoration:underline">View request details</a>`:''}</div>`
}
export function emailLayout({title='Fix It Today',preheader='',bodyHtml='',reference,detailsUrl,footerReason='A service update for your Fix It Today request, order or account.'}={}) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(title)}</title>
<style>:root{color-scheme:light dark}body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{mso-table-lspace:0;mso-table-rspace:0}img{border:0;outline:none;text-decoration:none}a{word-break:break-word} @media(max-width:480px){.fit-pad{padding-left:20px!important;padding-right:20px!important}.fit-outer{padding:12px 8px!important}.fit-title{font-size:24px!important}} @media(prefers-color-scheme:dark){.fit-bg{background:#10151d!important}.fit-card{background:#1b2430!important;border-color:#3f4c5c!important}.fit-ink,.fit-card{color:#f2f5f8!important}.fit-muted{color:#bcc7d5!important}.fit-link{color:#b8d7ff!important}.fit-soft{background:#263241!important}.fit-cta,.fit-cta a{background:#f4b321!important;color:#17202a!important}} [data-ogsc] .fit-bg{background:#10151d!important}[data-ogsc] .fit-card{background:#1b2430!important;color:#f2f5f8!important}[data-ogsc] .fit-ink{color:#f2f5f8!important}[data-ogsc] .fit-muted{color:#bcc7d5!important}[data-ogsc] .fit-link{color:#b8d7ff!important}</style></head>
<body class="fit-bg" style="margin:0;padding:0;background:#f3f4f6;color:#17202a"><div aria-hidden="true" style="display:none!important;visibility:hidden;opacity:0;mso-hide:all;height:0;max-height:0;overflow:hidden">${esc(preheader)}</div>
<table class="fit-bg" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3f4f6" style="width:100%;background:#f3f4f6"><tr><td class="fit-outer" align="center" style="padding:28px 12px">
<!--[if mso]><table role="presentation" width="640" align="center"><tr><td><![endif]-->
<table class="fit-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:640px;width:100%;table-layout:fixed;background:#ffffff;border:1px solid #d9dee5;border-radius:12px;color:#17202a">
<tr><td class="fit-pad" style="padding:24px 32px 20px;border-top:5px solid #f4b321;border-bottom:1px solid #d9dee5"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#f4b321" style="padding:7px 8px;border-radius:5px;background:#f4b321;color:#17202a;font:900 17px/1 ${FONT}">FIT</td><td class="fit-ink" style="padding-left:12px;font:700 18px/1.4 ${FONT};color:#17202a">Fix It Today</td></tr></table></td></tr>
<tr><td class="fit-pad fit-ink" style="padding:28px 32px 30px;font:16px/1.6 ${FONT};color:#17202a;overflow-wrap:anywhere;word-break:break-word">${bodyHtml}${referenceFooter(reference,detailsUrl)}</td></tr>
<tr><td class="fit-pad fit-muted" style="padding:20px 32px;border-top:1px solid #d9dee5;color:#56616f;font:12px/1.65 ${FONT};word-break:break-word">${esc(footerReason)}<br>Questions? Reply to this email or <a class="fit-link" href="mailto:${CONTACT_EMAIL}" style="color:#354c66;text-decoration:underline">contact FIT</a>.<br><a class="fit-link" href="${SITE_URL}" style="color:#354c66;text-decoration:underline">fixitoday.com</a></td></tr></table>
<!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`
}

// Text fallback for our own controlled HTML. Explicit preparation text always
// takes precedence in sendEmail; no customer source is interpreted as markup.
export function emailPlainText(html='') {
  return String(html).replace(/<head\b[\s\S]*?<\/head>/gi,'').replace(/<(?:style|script)\b[\s\S]*?<\/(?:style|script)>/gi,'').replace(/<div\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/div>/gi,'')
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,(_,href,label)=>`${label} (${href})`)
    .replace(/<img\b[^>]*alt="([^"]*)"[^>]*>/gi,'$1').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(?:p|h[1-6]|div|tr|table|li)>/gi,'\n').replace(/<\/td>/gi,'  ').replace(/<[^>]*>/g,'')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#x27);/gi,e=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' ','&#39;':"'",'&#x27;':"'"}[e.toLowerCase()]||e)).replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim()
}
export const emailResult = (subject,html,extras={}) => ({subject,html,text:emailPlainText(html),...extras})
export function structuredTextEmail({title,text,reference,detailsUrl=`${SITE_URL}/admin`,action='View details',preheader=''}={}) {
  const paragraphs=String(text||'').split(/\n\s*\n/).map(block=>{
    const lines=block.split('\n'),head=lines[0]
    const isHeading=/^(?:[A-Z][A-Z /]+|Preparation.*|Exact preparation.*|Payment \/ Stripe.*|Assessment preparation)$/.test(head)
    return `${isHeading?`<h2 class="fit-ink" style="font-size:18px;line-height:1.4;margin:24px 0 10px;color:#17202a">${esc(head)}</h2>`:''}<div style="margin:0 0 14px;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word">${esc((isHeading?lines.slice(1):lines).join('\n'))}</div>`
  }).join('')
  return emailLayout({title,preheader,reference,detailsUrl,bodyHtml:bodyBlock({heading:title})+paragraphs+ctaButton({href:detailsUrl,label:action})})
}
