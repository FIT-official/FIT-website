// Pure state helpers for the print request page: plain-language print choices
// <-> printSettings, the checklist that gates "Add to cart", and restoring the
// page from a saved request.
import { DEFAULT_EDITOR_PRINT_SETTINGS, QUALITY_MAP, STRENGTH_MAP } from '@/lib/quoting/genericPresets'
import { addressComplete } from './deliveryOptions'

export const STRENGTH_LEVELS = Object.keys(STRENGTH_MAP)
export const QUALITY_LEVELS = Object.keys(QUALITY_MAP)
export const OPTION_KEYS = ['postProcessing', 'specialRequest', 'priority', 'expedite']
export const DEFAULT_OPTIONS = Object.freeze({ postProcessing: false, specialRequest: false, priority: false, expedite: false })

export function pickOptions(source = {}) {
  return Object.fromEntries(OPTION_KEYS.map(key => [key, source?.[key] === true]))
}

export const ADVANCED_FIELDS = Object.freeze([
  { key: 'layerHeight', label: 'Layer height', options: [0.12, 0.2, 0.3], format: value => `${Number(value).toFixed(2)} mm` },
  { key: 'sparseInfillDensity', label: 'Infill', options: [10, 20, 40, 100], format: value => `${value}%` },
  { key: 'wallLoops', label: 'Walls', options: [1, 2, 4], format: value => String(value) },
])
export const SUPPORT_OPTIONS = Object.freeze([
  { value: 'none', label: 'None' }, { value: 'Normal', label: 'Normal' }, { value: 'Tree', label: 'Tree' },
])

export function strengthFromSettings(settings = {}) {
  return STRENGTH_LEVELS.find(level => Object.entries(STRENGTH_MAP[level]).every(([key, value]) => settings[key] === value)) || ''
}

export function qualityFromSettings(settings = {}) {
  return QUALITY_LEVELS.find(level => Object.entries(QUALITY_MAP[level]).every(([key, value]) => settings[key] === value)) || ''
}

export function applyStrength(settings, strength) {
  return { ...settings, ...(STRENGTH_MAP[strength] || STRENGTH_MAP.Normal) }
}

export function applyQuality(settings, quality) {
  return { ...settings, ...(QUALITY_MAP[quality] || QUALITY_MAP.Medium) }
}

export function applyAdvanced(settings, key, value) {
  if (key === 'layerHeight') return { ...settings, layerHeight: value, initialLayerHeight: value }
  if (key === 'support') {
    return value === 'none' ? { ...settings, enableSupport: false } : { ...settings, enableSupport: true, supportType: value }
  }
  return { ...settings, [key]: value }
}

export function supportValue(settings = {}) {
  return settings.enableSupport ? settings.supportType || 'Normal' : 'none'
}

export function buildPrintSettings({ filament = 'pla', settings = {} } = {}) {
  return { ...DEFAULT_EDITOR_PRINT_SETTINGS, ...settings, materialType: 'plastic', filamentType: filament }
}

// The saved generic block must agree with printSettings (validatePrintConfiguration),
// so strength/quality are only written when the settings still match a preset.
export function buildGeneric({ printSettings, colour }) {
  const strength = strengthFromSettings(printSettings)
  const quality = qualityFromSettings(printSettings)
  return {
    material: 'plastic', filament: printSettings.filamentType || 'pla', colour: colour || null,
    ...(strength ? { strength } : {}), ...(quality ? { quality } : {}),
  }
}

export function buildChecklist({ hasModel, fits, hasColour, delivery, address }) {
  const needsAddress = Boolean(delivery?.needsAddress)
  return [
    { key: 'model', label: 'Upload a model', ok: Boolean(hasModel) },
    { key: 'fits', label: 'Model fits the printer', ok: Boolean(hasModel) && fits !== false },
    { key: 'material', label: 'Material and colour chosen', ok: Boolean(hasColour) },
    { key: 'delivery', label: needsAddress ? 'Delivery address complete' : 'Collection selected',
      ok: Boolean(delivery) && (!needsAddress || addressComplete(address)) },
  ]
}

export const EDITABLE_STATUSES = ['pending_upload', 'pending_config', 'configured', 'quoted']
export const MODEL_EDITABLE_STATUSES = ['pending_upload', 'pending_config', 'configured']
export const MANUAL_QUOTE_LOCK = 'This request was quoted by Fix It Today; add it to the cart from your account.'
export const FULFILMENT_LOCK = 'This request is already in payment or fulfilment, so its settings are locked.'

// A request the store has priced by hand must not be turned back into an
// instant quote from this page.
export function isManuallyQuoted(request = {}) {
  return request.quoteMode === 'manual' && !MODEL_EDITABLE_STATUSES.includes(request.status)
}

export function restoreFromRequest(request = {}, colours = []) {
  const configuration = request.printConfiguration || {}
  const printSettings = { ...DEFAULT_EDITOR_PRINT_SETTINGS, ...(configuration.printSettings || {}) }
  const filament = printSettings.filamentType || configuration.generic?.filament || 'pla'
  const meshColors = Object.fromEntries(Object.entries(configuration.meshColors || {}).map(([name, hex]) => [name, String(hex).toLowerCase()]))
  const meshHexes = [...new Set(Object.values(meshColors))]
  const byHex = meshHexes.length === 1
    ? colours.find(colour => colour.filament === filament && colour.hex?.toLowerCase() === meshHexes[0])?.name : null
  // Colours chosen per part in the 3D editor: no single catalogue colour
  // describes the print, so the page must carry the mesh colours unchanged.
  const perPartColours = !configuration.generic?.colour && meshHexes.length > 1
  const options = request.quote?.inputs?.options || {}
  const manual = isManuallyQuoted(request)
  const fulfilment = !EDITABLE_STATUSES.includes(request.status) || Boolean(request.paidAt || request.stripeSessionId || request.stripePaymentIntentId || request.creatorUserId) || request.source === 'product'
  return {
    printSettings, filament, meshColors, perPartColours,
    colour: perPartColours ? '' : configuration.generic?.colour || byHex || '',
    options: pickOptions({ ...options, expedite: options.expedite ?? request.quote?.expedite?.applied }),
    note: request.customerNote || '',
    source: request.designSource?.url ? request.designSource : null,
    locked: fulfilment || manual,
    lockReason: fulfilment ? FULFILMENT_LOCK : manual ? MANUAL_QUOTE_LOCK : '',
    modelLocked: !MODEL_EDITABLE_STATUSES.includes(request.status),
  }
}
