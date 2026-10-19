// Client-side checks for the "drop a model or paste a link" entry. Everything here is advisory and local: nothing is fetched,
// opened, extracted or executed. The server keeps its own checks (publicReference in guidedBrief for links; the fabrication asset
// service for uploads), so these only give people fast, specific feedback.
import { GUIDED_FILE_BYTES, publicReference } from './guidedBrief'

const KNOWN_SITES = { 'makerworld.com': 'MakerWorld', 'printables.com': 'Printables', 'thingiverse.com': 'Thingiverse', 'thangs.com': 'Thangs' }
const PRIVATE_HOST = /^(localhost|.*\.(localhost|local|internal|lan|home|corp|test|invalid))$/i

// A link is only ever stored and shown, never requested by FIT. The label is the HOST the person pasted, not a model title.
export function inspectModelLink(raw) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return { state: 'empty' }
  if (text.length > 2048) return { state: 'invalid', message: 'That link is too long.' }
  let url
  try { url = new URL(text) } catch { return { state: 'invalid', message: 'That does not look like a web link. Paste the full address, starting with https://' } }
  if (url.protocol === 'http:') return { state: 'invalid', message: 'Use a secure link that starts with https://' }
  if (url.protocol !== 'https:') return { state: 'invalid', message: 'Only https:// web links are accepted. Files, scripts and other link types are not.' }
  if (url.username || url.password) return { state: 'invalid', message: 'Remove the username or password from the link.' }
  if (url.port && url.port !== '443') return { state: 'invalid', message: 'Links with a custom port are not accepted.' }
  const host = url.hostname.toLowerCase()
  if (/[\[\]:]/.test(host) || /^[\d.]+$/.test(host) || PRIVATE_HOST.test(host) || !host.includes('.')) return { state: 'invalid', message: 'Links to this computer, a private network or a bare address are not accepted. Use the public page of the model.' }
  const href = publicReference(text)
  if (!href) return { state: 'invalid', message: 'Use a public https link without login details.' }
  const bare = host.replace(/^www\./, '')
  const site = Object.entries(KNOWN_SITES).find(([domain]) => bare === domain || bare.endsWith('.' + domain))?.[1] || null
  return { state: 'ok', href, host: bare, site }
}

const MODEL_EXT = /\.(stl|obj|3mf)$/i
const HEAD_BYTES = 64 * 1024
const readHead = async blob => {
  const part = blob.slice(0, HEAD_BYTES)
  if (typeof part.arrayBuffer === 'function') return new Uint8Array(await part.arrayBuffer())
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(new Uint8Array(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(part) })
}
const startsWith = (bytes, ...codes) => codes.every((code, index) => bytes[index] === code)
const sizeLabel = bytes => bytes < 1024 ? `${bytes} bytes` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`

// Looks at the file NAME, SIZE and the first 64 KB only. A 3MF is a ZIP archive: only its signature is read; it is never
// opened, listed or extracted here. Passing these checks does not make a file safe, valid, printable or permitted.
export async function checkModelFile(file, { maxBytes = GUIDED_FILE_BYTES } = {}) {
  const fail = (code, message) => ({ ok: false, code, message })
  if (!file || typeof file.name !== 'string') return fail('none', 'Choose one model file.')
  if (/\.(gcode|gco|g|nc)$/i.test(file.name)) return fail('type', 'G-code is machine instructions, not a model, and is not accepted. Send the STL, OBJ or 3MF model instead.')
  if (/\.(step|stp|iges|igs|f3d|dwg|dxf|zip|rar|7z)$/i.test(file.name)) return fail('type', 'That file type is not supported here. Export an STL, OBJ or 3MF, or send a link and ask for help.')
  const match = file.name.match(MODEL_EXT)
  if (!match) return fail('type', 'Choose an STL, OBJ or 3MF file.')
  const ext = match[1].toLowerCase()
  if (!file.size) return fail('empty', 'That file is empty. Export the model again and retry.')
  if (file.size > maxBytes) return fail('size', `That file is ${sizeLabel(file.size)}. This form accepts up to ${sizeLabel(maxBytes)}. Simplify the model, or send a link and we will help.`)
  let head
  try { head = await readHead(file) } catch { return fail('read', 'The file could not be read. Choose it again.') }
  const zip = startsWith(head, 0x50, 0x4b, 0x03, 0x04)
  const executable = startsWith(head, 0x4d, 0x5a) || startsWith(head, 0x7f, 0x45, 0x4c, 0x46) || startsWith(head, 0x23, 0x21) || startsWith(head, 0x25, 0x50, 0x44, 0x46)
  if (executable) return fail('mismatch', `That file is not a ${ext.toUpperCase()} model even though its name says so. It was not uploaded.`)
  if (ext === '3mf') {
    if (!zip) return fail('mismatch', 'That file is not a 3MF package. Export it again from your design software.')
    return { ok: true, ext, kind: '3mf', size: file.size, sizeLabel: sizeLabel(file.size), note: '3MF is a compressed package. FIT does not open it in your browser; staff check it after upload.' }
  }
  if (zip) return fail('mismatch', `That file is a compressed archive, not an ${ext.toUpperCase()} model. Unzip it and choose the model inside.`)
  if (ext === 'stl') {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(head)
    if (/^\s*solid\b/i.test(text) && /\bfacet\b/i.test(text)) return { ok: true, ext, kind: 'stl-ascii', size: file.size, sizeLabel: sizeLabel(file.size), note: 'STL has no declared units; FIT confirms scale before any quote.' }
    if (head.length >= 84) {
      const triangles = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(80, true)
      if (triangles > 0 && file.size === 84 + 50 * triangles) return { ok: true, ext, kind: 'stl-binary', size: file.size, sizeLabel: sizeLabel(file.size), note: 'STL has no declared units; FIT confirms scale before any quote.' }
    }
    return fail('mismatch', 'That does not look like a valid STL model. Re-export it, or send a link and ask for help.')
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(head)
  if (head.includes(0) || !/^\s*v\s+-?[\d.]/m.test(text)) return fail('mismatch', 'That does not look like an OBJ model (no vertices found). Re-export it, or send a link and ask for help.')
  return { ok: true, ext, kind: 'obj', size: file.size, sizeLabel: sizeLabel(file.size), note: 'OBJ is checked by staff after upload.' }
}

// What a model-ready print-quote request needs: a model FILE or a model LINK, a quantity and a size (original or longest side).
// Material, colour, category and notes are optional. The 'help' mode is the existing design-help path (no model yet): it only needs
// a description and a quantity, and it is recorded as "Help finding a model" so staff do not treat it as a ready-to-quote model.
export function quoteRequirements({ mode, purpose, link, hasFile, quantity, sizeMode, size }) {
  const missing = []
  if (!String(purpose || '').trim()) missing.push('say what you want printed')
  if (mode !== 'help') {
    const inspected = inspectModelLink(link)
    if (inspected.state === 'invalid') missing.push('fix or remove the model link')
    else if (!hasFile && inspected.state !== 'ok') missing.push('add a model file or a model link')
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) missing.push('enter how many copies (1 to 1,000)')
  if (mode !== 'help' && !(sizeMode === 'original' || (sizeMode === 'longest' && Number(size) > 0))) missing.push('choose the size: original, or the longest side')
  return { ready: missing.length === 0, missing }
}
