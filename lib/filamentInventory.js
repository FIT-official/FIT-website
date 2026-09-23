import { createSign } from 'node:crypto'

import { FILAMENTS, FILAMENT_COLOURS } from './filamentCatalogue.js'

const CATEGORY_TO_FILAMENT = Object.fromEntries(FILAMENTS.map(item => [item.category.toLowerCase(), item.value]))
const SHEET_ID = '1nBO_t2Hf-PQPmWYtJ5Gd3Ws6jiHAQZhuJio0YHeN1Bw'
const INVENTORY_RANGE = 'Inventory List!A2:E2000'
const TOKEN_URI = 'https://oauth2.googleapis.com/token'
const CACHE_MS = 60_000
let cached = null
let pending = null

export function parseFilamentInventory(rows) {
  const quantities = new Map()
  for (const row of rows || []) {
    const [product = '', category = '', brand = '', colour = '', rawQuantity = ''] = row
    if (String(brand).replace(/\s/g, '').toLowerCase() !== 'bambulab') continue
    const filament = CATEGORY_TO_FILAMENT[String(category).trim().toLowerCase()]
    if (!filament) continue
    const code = String(colour).match(/\b\d{5}\b/)?.[0] || String(product).match(/\b\d{5}\b/)?.[0]
    const item = FILAMENT_COLOURS.find(entry => entry.filament === filament &&
      (entry.code === code || (filament === 'tpu' && new RegExp(`\\b${entry.name}\\b`, 'i').test(`${colour} ${product}`))))
    if (!item) continue
    const count = Number(String(rawQuantity).replace(/,/g, ''))
    if (!Number.isFinite(count) || count < 0) continue
    const key = `${filament}:${item.code}`
    quantities.set(key, (quantities.get(key) || 0) + count)
  }
  return FILAMENT_COLOURS.map(item => {
    const count = quantities.get(`${item.filament}:${item.code}`)
    return { ...item, stockStatus: count > 0 ? 'in_stock' : 'out_of_stock' }
  })
}

export function unavailableFilamentCatalogue() {
  return FILAMENT_COLOURS.map(item => ({ ...item, stockStatus: 'unknown' }))
}

async function accessToken() {
  const raw = process.env.FIT_INVENTORY_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('FIT inventory service account is not configured')
  const credentials = JSON.parse(raw)
  if (!credentials.client_email || !credentials.private_key || credentials.token_uri !== TOKEN_URI) throw new Error('Incomplete FIT inventory credentials')
  const now = Math.floor(Date.now() / 1000)
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: credentials.token_uri,
    iat: now, exp: now + 3000 })}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  const assertion = `${unsigned}.${signer.sign(credentials.private_key, 'base64url')}`
  const response = await fetch(TOKEN_URI, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    cache: 'no-store' })
  if (!response.ok) throw new Error(`FIT inventory token failed (${response.status})`)
  const data = await response.json()
  if (!data.access_token) throw new Error('FIT inventory token missing')
  return data.access_token
}

export async function getFilamentAvailability() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.colours
  if (pending) return pending
  pending = (async () => {
    const token = await accessToken()
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(INVENTORY_RANGE)}?valueRenderOption=UNFORMATTED_VALUE`
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    if (!response.ok) throw new Error(`FIT inventory sheet failed (${response.status})`)
    const rows = (await response.json()).values
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('FIT inventory sheet is empty')
    const colours = parseFilamentInventory(rows)
    cached = { at: Date.now(), colours }
    return colours
  })().finally(() => { pending = null })
  return pending
}

export function rushAvailability(colours, filament, colour) {
  return colours.find(item => item.filament === filament && item.name === colour)?.stockStatus || 'unknown'
}
