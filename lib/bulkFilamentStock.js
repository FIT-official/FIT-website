import { createSign } from 'node:crypto'
import { BULK_STOCK_SNAPSHOT } from './bulkFilamentStockSnapshot'

const TOKEN_URI = 'https://oauth2.googleapis.com/token'
const SHEET_ID = '1nBO_t2Hf-PQPmWYtJ5Gd3Ws6jiHAQZhuJio0YHeN1Bw'
const RANGE = "'Inventory List'!A2:G2000"

export function parseBulkStock(rows) {
  const items = new Map()
  for (const row of rows) {
    const product = String(row.product || '').trim(), brand = String(row.brand || '').trim()
    const material = String(row.material || '').trim(), colour = String(row.colour || '').trim()
    const barcode = String(row.barcode || '').trim()
    const lanbo = brand === 'Lanbo' && product === `Lanbo ${material}` && ['PLA', 'PETG'].includes(material)
    const fitMarble = brand === 'FIT' && product === 'FIT PLA' && material === 'PLA' && /\bmarble\b/i.test(colour)
    if ((!lanbo && !fitMarble) || !colour || !/^\d{1,20}$/.test(barcode)) continue
    // A malformed quantity cannot become available stock or fall back to Mongo.
    const quantity = typeof row.quantity === 'number' && Number.isSafeInteger(row.quantity) && row.quantity >= 0 ? row.quantity : 0
    const key = `${brand}:${material}:${barcode}`
    const previous = items.get(key)
    if (previous && previous.colour !== colour) throw Error('Conflicting inventory identities')
    items.set(key, { key, product, brand, material, colour, barcode, sheetQuantity: Math.min(previous?.sheetQuantity ?? quantity, quantity) })
  }
  return [...items.values()].map(item => {
    const marble = item.brand === 'Lanbo' && item.material === 'PLA' && (item.barcode === '838' || /^marble$/i.test(item.colour))
    const black = item.brand === 'Lanbo' && item.material === 'PETG' && (item.barcode === '332' || /^black$/i.test(item.colour))
    return { ...item, available: Math.max(0, Math.min(item.sheetQuantity - (black ? 1 : 0), marble ? 7 : black ? 12 : Infinity)),
      ladder: item.material === 'PETG' ? 'PETG' : /\b(marble|wood)\b/i.test(item.colour) ? 'SPECIALTY_PLA' : 'PLA' }
  })
}

export async function loadBulkStock() {
  if (!process.env.FIT_INVENTORY_SERVICE_ACCOUNT_JSON) return {
    items: parseBulkStock(BULK_STOCK_SNAPSHOT.rows), source: 'snapshot', checkedAt: BULK_STOCK_SNAPSHOT.checkedAt,
  }
  // Configured live access fails closed. A Sheet outage must not revive stale stock.
  const credentials = JSON.parse(process.env.FIT_INVENTORY_SERVICE_ACCOUNT_JSON)
  if (!credentials.client_email || !credentials.private_key || credentials.token_uri !== TOKEN_URI) throw Error('Incomplete FIT inventory credentials')
  const now = Math.floor(Date.now() / 1000), encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: TOKEN_URI, iat: now, exp: now + 3000 })}`
  const signer = createSign('RSA-SHA256'); signer.update(unsigned)
  const tokenResponse = await fetch(TOKEN_URI, { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signer.sign(credentials.private_key, 'base64url')}` }) })
  if (!tokenResponse.ok) throw Error('Inventory authentication unavailable')
  const { access_token: token } = await tokenResponse.json()
  if (!token) throw Error('Inventory authentication unavailable')
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGE)}?valueRenderOption=UNFORMATTED_VALUE`, {
    cache: 'no-store', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw Error('Inventory Sheet unavailable')
  const { values } = await response.json()
  if (!Array.isArray(values)) throw Error('Inventory Sheet unavailable')
  const rows = values.map(([product, material, brand, colour, quantity, , barcode]) => ({ product, material, brand, colour, quantity, barcode }))
  return { items: parseBulkStock(rows), source: 'sheet', checkedAt: new Date().toISOString() }
}
