// Pure description of "which model files does this custom-print request hold, and what did the customer save for each", for the customer's own idle-nudge email only.
// It only READS what is stored: it never recomputes a price, never invents a choice (a missing or "help me choose" value is reported as such, never defaulted to PLA or a colour), and
// never divides an order total across files. It carries no storage key, bucket or URL. No staff, payment-state or admin detail is read or returned.
export const PREVIEW_FORMATS = Object.freeze(['stl', 'obj', '3mf'])
export const extensionOf = name => { const m = /\.([a-z0-9]{1,8})$/i.exec(String(name || '').split(/[?#]/)[0]); return m ? m[1].toLowerCase() : '' }

const FILAMENT_LABELS = { pla: 'PLA', pla_matte: 'PLA Matte', petg: 'PETG', asa: 'ASA', abs: 'ABS', tpu: 'TPU', plastic: 'Plastic', resin: 'Resin', metal: 'Metal', sandstone: 'Sandstone' }
const PRICED_STATUSES = ['quoted', 'payment_pending', 'paid', 'printing', 'printed', 'shipped', 'delivered']
const NOT_SPECIFIED = Object.freeze({ state: 'not_specified', text: 'Not specified' })
const isNumber = value => typeof value === 'number' && Number.isFinite(value)
const text = value => (typeof value === 'string' && value.trim() ? value.trim() : null)
const baseName = key => String(key || '').split('/').pop() || null
const cents = value => (Number.isSafeInteger(value) && value >= 0 ? value : null)

function materialValue(value, brief) {
  const v = text(value); if (!v) return null
  const key = v.toLowerCase()
  if (brief && key === 'help') return { state: 'help', text: 'Customer asked for help choosing' }
  if (brief && key === 'other') return { state: 'specified', text: 'Other (see instructions)' }
  return { state: 'specified', text: FILAMENT_LABELS[key] || v }
}
function colourValue(value) {
  const v = text(value); if (!v) return null
  return /^help( me choose)?$/i.test(v) ? { state: 'help', text: 'Customer asked for help choosing' } : { state: 'specified', text: v }
}

// Request-wide choices as they are actually stored. A guided brief carries one material and colour for the whole request; the advanced flow stores them under printConfiguration.generic.
function requestWideChoices(request) {
  const brief = request.guidedBrief?.version ? request.guidedBrief : null
  if (brief) return { material: materialValue(brief.material, true), colour: colourValue(brief.colour) }
  const config = request.printConfiguration || {}, generic = config.generic || {}
  // The saved print settings count as the customer's selection only when the configuration was actually saved (isConfigured); an unsaved request carries schema defaults that nobody chose.
  const settings = config.isConfigured === true ? config.printSettings || {} : {}
  const material = materialValue(generic.filament || generic.material || settings.filamentType || settings.materialType, false)
  let colour = colourValue(generic.colour)
  if (!colour && config.isConfigured === true) {
    const mesh = config.meshColors instanceof Map ? Object.fromEntries(config.meshColors) : config.meshColors && typeof config.meshColors === 'object' ? config.meshColors : {}
    const hexes = [...new Set(Object.values(mesh).filter(v => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)).map(v => v.toLowerCase()))]
    if (hexes.length) colour = { state: 'specified', text: `Saved per-part colours: ${hexes.slice(0, 6).join(', ')}${hexes.length > 6 ? ` and ${hexes.length - 6} more` : ''} (hex values from the editor, not colour names)` }
  }
  return { material, colour }
}

export function orderQuoted(request) {
  const currency = String(request.quote?.currency || request.currency || 'sgd').toUpperCase()
  if (request.quoteMode === 'instant' && isNumber(request.quote?.total)) return { state: 'quoted', amount: request.quote.total, currency, source: 'instant' }
  const amount = (Number(request.basePrice) || 0) + (Number(request.printFee) || 0)
  if (PRICED_STATUSES.includes(request.status) && amount > 0) return { state: 'quoted', amount: Math.round(amount * 100) / 100, currency, source: 'manual' }
  return { state: 'not_quoted' }
}

// Per-file price from the stored payment snapshot, matched by asset id only. The snapshot's own quantity and unit price are kept as recorded; a quantity that no longer equals the
// request's is flagged, never silently reassigned. Never read from anything a client sends on the asset entry.
function recordedPrice(gp, entry, requestQuantity) {
  const lines = (gp.lineItems || []).filter(l => l && l.assetId === entry.id)
  if (lines.length === 0) return { state: 'no_record' }
  const line = lines[0]
  if (lines.length > 1 || cents(line.unitCents) == null || !Number.isSafeInteger(line.quantity) || line.quantity < 1) return { state: 'ambiguous' }
  const currency = String(gp.currency || 'sgd').toUpperCase()
  return { state: 'recorded', scope: 'payment_record', unit: line.unitCents / 100, quantity: line.quantity, amount: (line.unitCents * line.quantity) / 100, currency, requestQuantity: isNumber(requestQuantity) ? requestQuantity : null, mismatch: isNumber(requestQuantity) && requestQuantity !== line.quantity }
}

/**
 * @param {object} request  a CustomPrintRequest (lean)
 * @param {{assets?: Record<string, {originalName?: string}>}} context  files already checked as owned by request.userId
 * @returns {{ models: object[] }}
 */
export function buildPreviewModels(request, { assets = {} } = {}) {
  const wide = requestWideChoices(request)
  const quoted = orderQuoted(request)
  const entries = []
  if (Array.isArray(request.guidedAssets) && request.guidedAssets.length) {
    for (const entry of request.guidedAssets) entries.push({ id: entry.assetId, source: 'guided', fileName: assets[entry.assetId]?.originalName || null, fileRecord: !!assets[entry.assetId], quantity: entry.quantity })
  } else if (request.guidedAssetId) {
    entries.push({ id: request.guidedAssetId, source: 'guided', fileName: assets[request.guidedAssetId]?.originalName || null, fileRecord: !!assets[request.guidedAssetId], quantity: request.guidedBrief?.quantity })
  } else if (request.modelFile?.s3Key || request.modelFile?.originalName) {
    entries.push({ id: 'legacy', source: 'upload', fileName: text(request.modelFile.originalName) || baseName(request.modelFile.s3Key), fileRecord: !!request.modelFile.s3Key, quantity: null })
  }
  const multi = entries.length > 1
  const names = entries.map(e => (e.fileName || '').toLowerCase())
  const models = entries.map((entry, index) => {
    const duplicate = !!entry.fileName && names.filter(n => n === names[index]).length > 1
    const label = entry.fileName ? (duplicate ? `${entry.fileName} (model ${index + 1})` : entry.fileName) : `Model ${index + 1} (file name unavailable)`
    const format = extensionOf(entry.fileName)
    // Material and colour are stored once per request, so they are labelled "applies to all models" only when there is more than one model.
    const pick = shared => (shared ? { ...shared, scope: multi ? 'all' : 'request' } : { ...NOT_SPECIFIED, scope: multi ? 'all' : 'request' })
    let price
    if (request.guidedPayment && Array.isArray(request.guidedPayment.lineItems) && request.guidedPayment.lineItems.length) price = recordedPrice(request.guidedPayment, entry, entry.quantity)
    else if (!multi && quoted.state === 'quoted') price = { state: 'quoted', amount: quoted.amount, currency: quoted.currency, scope: 'order' }
    else if (multi) price = { state: 'not_allocated' }
    else price = { state: 'not_quoted' }
    return {
      id: entry.id, index, label, fileName: entry.fileName, format, previewable: PREVIEW_FORMATS.includes(format), fileAvailable: entry.fileRecord, source: entry.source,
      quantity: isNumber(entry.quantity) ? entry.quantity : null,
      material: pick(wide.material), colour: pick(wide.colour),
      price,
    }
  })
  return { models }
}
