import { COLOURS, normalizeHex } from './colours'

export function problem(message) { throw Object.assign(new Error(message), { status: 400 }) }
export function number(value, label, min = 0, max = 1000000) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '' ||
      !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(value).trim())) problem(`Enter a valid ${label}.`)
  const result = Number(value)
  if (!Number.isFinite(result) || result < min || result > max) problem(`${label} must be between ${min} and ${max}.`)
  return result
}
export function estimateMaterial(input) {
  const copies = number(input.copies, 'copies', 1, 10000)
  if (!Number.isInteger(copies)) problem('Copies must be a whole number.')
  const allowance = number(input.allowancePercent, 'reserve (%)', 0, 100)
  const amount = number(input.amount, 'material amount', 0.000001, 1000000)
  let grams, formula
  if (input.mode === 'mass') { grams = amount; formula = 'Entered grams per copy' }
  else {
    const density = number(input.density, 'density (g/cm³)', 0.1, 20)
    if (input.mode === 'volume') { grams = amount * density; formula = 'Deposited plastic volume (cm³) × density (g/cm³)' }
    else if (input.mode === 'length') {
      const diameter = number(input.diameter, 'diameter (mm)', 0.5, 5)
      // π(d/2)² mm² × length m × 1000 mm/m ÷ 1000 mm³/cm³.
      grams = Math.PI * (diameter / 2) ** 2 * amount * density
      formula = 'π × (diameter in mm ÷ 2)² × length in metres × density (g/cm³)'
    } else problem('Choose grams, metres or cubic centimetres.')
  }
  const extra = number(input.extraGrams, 'additional support / purge grams', 0, 1000000)
  const consumptionGrams = (grams + extra) * copies
  const reserveGrams = consumptionGrams * allowance / 100
  const totalGrams = consumptionGrams + reserveGrams
  const price = input.pricePerKg === '' || input.pricePerKg == null ? null : number(input.pricePerKg, 'cost per kg (SGD)', 0, 100000)
  const minutes = input.minutes === '' || input.minutes == null ? null : number(input.minutes, 'slicer minutes per copy', 0.01, 1000000)
  return { gramsPerCopy: grams, consumptionGrams, reserveGrams, totalGrams, formula,
    costSgd: price === null ? null : totalGrams / 1000 * price,
    minutes: minutes === null ? null : minutes * copies }
}

const text = (value, label, max) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) problem(`Enter ${label} (up to ${max} characters).`)
  return value.trim()
}
export const MATERIALS = ['PLA Basic', 'PLA', 'PLA Matte', 'PETG', 'ABS', 'ASA', 'TPU', 'Other']
export function validateInventory(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['revision', 'spools'].includes(k))) problem('Send only revision and spools.')
  if (!Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision >= Number.MAX_SAFE_INTEGER) problem('Reload your inventory revision.')
  if (!Array.isArray(body.spools) || body.spools.length > 100) problem('Keep up to 100 inventory entries.')
  const ids = new Set()
  const spools = body.spools.map(s => {
    if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).some(k => !['id', 'label', 'brand', 'material', 'referenceId', 'hex', 'remainingGrams', 'diameter', 'format'].includes(k))) problem('Check inventory fields.')
    if (typeof s.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(s.id) || ids.has(s.id)) problem('Use a unique inventory ID.')
    ids.add(s.id)
    const reference = COLOURS.find(c => c.id === s.referenceId)
    if (s.referenceId !== '' && !reference) problem('Choose a known colour reference or a custom filament.')
    if (!MATERIALS.includes(s.material)) problem('Choose a supported material.')
    if (reference && (s.brand !== reference.brand || s.material !== reference.material || normalizeHex(s.hex) !== reference.hex)) problem('Reference colour, brand and material must agree.')
    if (s.hex !== '' && !normalizeHex(s.hex)) problem('Enter a valid HEX colour or leave it blank.')
    if (!['spool', 'refill', 'loose'].includes(s.format)) problem('Choose spool, refill or loose filament.')
    if (![1.75, 2.85].includes(s.diameter)) problem('Choose a 1.75 mm or 2.85 mm diameter.')
    // JSON numbers only; prevents coercing strings/null into saved physical quantities.
    if (typeof s.remainingGrams !== 'number') problem('Remaining grams must be numeric.')
    return { id: s.id, label: text(s.label, 'a spool label', 100), brand: text(s.brand, 'a brand', 80),
      material: s.material, referenceId: s.referenceId, hex: s.hex === '' ? '' : normalizeHex(s.hex),
      remainingGrams: number(s.remainingGrams, 'remaining net filament grams', 0, 100000), diameter: s.diameter, format: s.format }
  })
  return { revision: body.revision, spools }
}

export function planProject(lines, spools, allowancePercent = 0) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 50) problem('Add between 1 and 50 project colours.')
  const allowance = number(allowancePercent, 'reserve (%)', 0, 100)
  const grouped = new Map()
  for (const line of lines) {
    const reference = COLOURS.find(c => c.id === line.referenceId)
    if (!reference) problem('Choose a verified project colour.')
    const grams = number(line.grams, 'required grams', 0.001, 1000000)
    grouped.set(reference.id, (grouped.get(reference.id) || 0) + grams)
  }
  return [...grouped].map(([referenceId, grams]) => {
    const requiredGrams = grams * (1 + allowance / 100)
    const onHandGrams = spools.filter(s => s.referenceId === referenceId && s.brand === 'Bambu Lab' && s.material === 'PLA Basic' && s.diameter === 1.75 && Number.isFinite(s.remainingGrams) && s.remainingGrams >= 0)
      .reduce((n, s) => n + s.remainingGrams, 0)
    const shortageGrams = Math.max(0, requiredGrams - onHandGrams)
    return { ...COLOURS.find(c => c.id === referenceId), requiredGrams, onHandGrams,
      allocatedGrams: Math.min(requiredGrams, onHandGrams), shortageGrams,
      // All offers in this initial planner have verified 1 kg net packaging.
      rollsNeeded: Math.ceil(Math.max(0, shortageGrams - 1e-9) / 1000) }
  })
}
