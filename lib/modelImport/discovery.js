import { normalizePublicUrl } from './safeFetch.js'
import { modelFormat, safeFilename } from './file.js'

export function providerFor(url) {
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  for (const [domain, provider] of [['makerworld.com', 'MakerWorld'], ['printables.com', 'Printables'], ['thingiverse.com', 'Thingiverse']]) {
    if (host === domain || host.endsWith(`.${domain}`)) return provider
  }
  return 'Direct file'
}

export function decodeHtml(value) {
  return String(value).replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' }
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()]
    const code = entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
  })
}

function plain(value, limit = 240) {
  return decodeHtml(value).replace(/<[^>]*>/g, ' ').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function attributes(tag) {
  const attrs = {}
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4])
  }
  return attrs
}

export function fileCandidate(value, baseUrl, suggestedName = '') {
  let url
  try { url = normalizePublicUrl(new URL(decodeHtml(value), baseUrl).href) } catch { return null }
  let filename
  try { filename = decodeURIComponent(url.pathname.split('/').pop()) } catch { return null }
  let format = modelFormat(filename)
  if (!format) {
    for (const parameter of ['filename', 'file', 'name']) {
      const queryName = url.searchParams.get(parameter)
      if (modelFormat(queryName || '')) { filename = queryName; format = modelFormat(queryName); break }
    }
  }
  // These are links observed in the source HTML, never synthesized API endpoints.
  if (!format && modelFormat(suggestedName) && (
    /\/download(?::|\/|$)/i.test(url.pathname) || /\/files?\/[^/]+\/download\/?$/i.test(url.pathname)
  )) { filename = suggestedName; format = modelFormat(filename) }
  return format ? { url: url.href, name: safeFilename(filename, format), format } : null
}

export function sourceDetails(value) {
  const url = normalizePublicUrl(value)
  const provider = providerFor(url)
  return { url: url.href, provider, title: '', attribution: `${provider}: ${url.href}` }
}

export function isGatedPage(html) {
  return /(?:<title[^>]*>\s*(?:just a moment|access denied|attention required)|cf-chl-|verify (?:that )?you are human|checking your browser|purchase (?:this model )?to download|subscribe to download|join (?:the )?club to download)/i.test(html)
}

/** Discover only file URLs already exposed in a returned public document. */
export function discoverFiles(html, pageUrl, source) {
  const candidates = new Map()
  let filesPage = null
  let author = ''
  const title = plain(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '')
  const add = (value, name) => {
    if (typeof value !== 'string' || candidates.size >= 12) return
    const candidate = fileCandidate(value, pageUrl, typeof name === 'string' ? name : '')
    if (candidate) candidates.set(candidate.url, candidate)
  }
  for (const tag of html.matchAll(/<meta\b[^>]{0,4096}>/gi)) {
    const attrs = attributes(tag[0])
    if (attrs.name?.toLowerCase() === 'author' && attrs.content) author = plain(attrs.content, 120)
  }
  for (const match of html.matchAll(/<a\b([^>]{0,8192})>([\s\S]{0,4096}?)<\/a>/gi)) {
    const attrs = attributes(match[1])
    if (!attrs.href) continue
    add(attrs.href, attrs.download || plain(match[2]))
    try {
      const link = normalizePublicUrl(new URL(attrs.href, pageUrl).href)
      const current = new URL(pageUrl)
      // Follow at most one actual same-design file tab, not arbitrary linked pages.
      const base = current.pathname.replace(/\/(?:files|comments|details)\/?$/, '').replace(/\/$/, '')
      if (link.origin === current.origin && link.pathname.replace(/\/$/, '') === `${base}/files`) filesPage = link.href
    } catch { /* discard unsafe or malformed links */ }
  }
  let visited = 0
  const scanJson = (value, depth = 0) => {
    if (++visited > 6000 || depth > 16 || !value || typeof value !== 'object') return
    if (Array.isArray(value)) { for (const item of value) scanJson(item, depth + 1); return }
    const name = value.filename || value.fileName || value.name
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string' && /^(?:url|download_?url|file_?url|contentUrl|src)$/i.test(key)) add(item, name)
      else if (item && typeof item === 'object') scanJson(item, depth + 1)
    }
    if (value.author && !author) author = plain(typeof value.author === 'string' ? value.author : value.author.name || '', 120)
  }
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = attributes(match[1])
    if (!/application\/(?:ld\+)?json/i.test(attrs.type || '') && attrs.id !== '__NEXT_DATA__') continue
    try { scanJson(JSON.parse(match[2])) } catch { /* scripts are data only; never execute */ }
  }
  return {
    files: [...candidates.values()], filesPage,
    source: { ...source, title: title || source.title,
      attribution: `${author ? `${author} — ` : ''}${title || source.title || source.provider} (${source.provider}) — ${source.url}`.slice(0, 4600) },
  }
}
