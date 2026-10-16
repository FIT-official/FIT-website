import { createSign } from 'node:crypto'
import { BULK_STOCK_SNAPSHOT } from './bulkFilamentStockSnapshot'
import { bulkStage } from './bulkFilamentDiagnostics'

const TOKEN_URI = 'https://oauth2.googleapis.com/token'
const SHEET_ID = '1nBO_t2Hf-PQPmWYtJ5Gd3Ws6jiHAQZhuJio0YHeN1Bw'
const RANGE = "'Inventory List'!A2:G2000"
const httpStatus = response => Number.isInteger(response.status) && response.status >= 400 && response.status <= 599 ? ` (HTTP ${response.status})` : ''

export function parseBulkStock(rows) {
  const items = new Map()
  for (const row of rows) {
    const product = String(row.product || '').trim(), brand = String(row.brand || '').trim()
    const material = String(row.material || '').trim(), colour = String(row.colour || '').trim()
    const barcode = String(row.barcode || '').trim()
    const lanbo = brand === 'Lanbo' && product === `Lanbo ${material}` && ['PLA', 'PETG'].includes(material)
    const fitMarble = brand === 'FIT' && product === 'FIT PLA' && material === 'PLA' && /\bmarble\b/i.test(colour)
    if (row.unit != null && !['roll', 'rolls'].includes(row.unit)) continue
    if (row.rollWeightGrams != null && row.rollWeightGrams !== 1000) continue
    if ((!lanbo && !fitMarble) || !colour || !/^\d{1,20}$/.test(barcode)) continue
    // A malformed quantity cannot become available stock or fall back to Mongo.
    const stockVerified = typeof row.quantity === 'number' && Number.isSafeInteger(row.quantity) && row.quantity >= 0
    const quantity = stockVerified ? row.quantity : 0
    const key = `${brand}:${material}:${barcode}`
    const previous = items.get(key)
    if (previous && previous.colour !== colour) throw Error(`Conflicting inventory identities: ${key}`)
    items.set(key, { key, product, brand, material, colour, barcode, stockVerified: stockVerified && previous?.stockVerified !== false, sheetQuantity: Math.min(previous?.sheetQuantity ?? quantity, quantity) })
  }
  return [...items.values()].map(item => {
    // Only Lanbo Marble has a seven-roll cap; FIT Marble uses its Sheet quantity.
    const lanboMarble = item.brand === 'Lanbo' && item.material === 'PLA' && (item.barcode === '838' || /^marble$/i.test(item.colour))
    const specialtyPla = item.material === 'PLA' && (item.brand === 'FIT' || lanboMarble || /marble|wood/i.test(item.colour))
    const black = item.brand === 'Lanbo' && item.material === 'PETG' && (item.barcode === '332' || /^black$/i.test(item.colour))
    return { ...item, available: Math.max(0, Math.min(item.sheetQuantity - (black ? 1 : 0), lanboMarble ? 7 : black ? 12 : Infinity)),
      ladder: item.material === 'PETG' ? 'PETG' : specialtyPla ? 'SPECIALTY_PLA' : 'PLA' }
  })
}

export async function loadBulkStock() {
  if (!process.env.FIT_INVENTORY_SERVICE_ACCOUNT_JSON) return {
    items: await bulkStage('inventory-parse', () => parseBulkStock(BULK_STOCK_SNAPSHOT.rows)),
    rows: BULK_STOCK_SNAPSHOT.rows, source: 'snapshot', checkedAt: BULK_STOCK_SNAPSHOT.checkedAt,
  }
  // Configured live access fails closed. A Sheet outage must not revive stale stock.
  const assertion = await bulkStage('inventory-credentials', () => {
    const credentials = JSON.parse(process.env.FIT_INVENTORY_SERVICE_ACCOUNT_JSON)
    if (!credentials.client_email || !credentials.private_key || credentials.token_uri !== TOKEN_URI) throw Error('Incomplete FIT inventory credentials')
    const now = Math.floor(Date.now() / 1000), encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: TOKEN_URI, iat: now, exp: now + 3000 })}`
    const signer = createSign('RSA-SHA256'); signer.update(unsigned)
    return `${unsigned}.${signer.sign(credentials.private_key, 'base64url')}`
  })
  const token = await bulkStage('inventory-authentication', async () => {
    const response = await fetch(TOKEN_URI, { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) })
    if (!response.ok) throw Error(`Inventory authentication unavailable${httpStatus(response)}`)
    const { access_token } = await response.json()
    if (!access_token) throw Error('Inventory authentication unavailable')
    return access_token
  })
  const rows = await bulkStage('inventory-sheet', async () => {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGE)}?valueRenderOption=UNFORMATTED_VALUE`, {
      cache: 'no-store', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw Error(`Inventory Sheet unavailable${httpStatus(response)}`)
    const { values } = await response.json()
    if (!Array.isArray(values)) throw Error('Inventory Sheet unavailable')
    return values.map(([product, material, brand, colour, quantity, , barcode]) => ({ product, material, brand, colour, quantity, barcode }))
  })
  const items = await bulkStage('inventory-parse', () => parseBulkStock(rows))
  return { items, rows, source: 'sheet', checkedAt: new Date().toISOString() }
}
