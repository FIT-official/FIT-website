/**
 * Generic print presets: translate the customer's plain-language choices
 * (Strength × Quality × Colour) into concrete `printSettings` consumed by the
 * editor, the print farm, and the Instant Quoting Engine. Pure + data-driven so
 * the print farm can tune the tables and so prices are unit-testable.
 *
 * The two axes are orthogonal: Quality drives layer height; Strength drives wall
 * loops + infill. (Note "Draft" means different things per axis — Quality-Draft
 * = thick/fast layers; Strength-Draft = low infill/walls to save filament.)
 */

// Quality → layer height (look/speed)
export const QUALITY_MAP = Object.freeze({
  Draft: { layerHeight: 0.3, initialLayerHeight: 0.3 },
  Medium: { layerHeight: 0.2, initialLayerHeight: 0.2 },
  High: { layerHeight: 0.12, initialLayerHeight: 0.12 },
})

// Strength → walls + infill (durability/material)
export const STRENGTH_MAP = Object.freeze({
  Draft: { wallLoops: 1, sparseInfillDensity: 10 },
  Normal: { wallLoops: 2, sparseInfillDensity: 20 },
  Strong: { wallLoops: 4, sparseInfillDensity: 40 },
})

export const DEFAULT_QUALITY = 'Medium'
export const DEFAULT_STRENGTH = 'Normal'

// Purpose is optional. These are process settings, not a mechanical-strength
// rating; orientation, material, geometry and print quality still matter.
export const PURPOSE_PRESETS = Object.freeze({
  Normal: { strength: 'Normal', quality: 'Medium', description: 'Balanced detail and material use.' },
  Strong: { strength: 'Strong', quality: 'Medium', description: 'More walls and infill for a denser print.' },
  Appearance: { strength: 'Normal', quality: 'High', description: 'Finer layers for visible surfaces.' },
})

export const SIMPLE_MATERIALS = Object.freeze([
  { value: 'plastic', label: 'Plastic' },
  { value: 'resin', label: 'Resin' },
  { value: 'metal', label: 'Metal' },
  { value: 'sandstone', label: 'Sandstone' },
])

export const DEFAULT_SIMPLE_SELECTION = Object.freeze({ purpose: '', material: 'plastic', colour: 'White' })
export const DEFAULT_EDITOR_PRINT_SETTINGS = Object.freeze({
  layerHeight: 0.2, initialLayerHeight: 0.2, materialType: 'plastic', wallLoops: 2,
  internalSolidInfillPattern: 'Rectilinear', sparseInfillDensity: 20,
  sparseInfillPattern: 'Rectilinear', nozzleDiameter: 0.4,
  enableSupport: false, supportType: 'Normal', printPlate: 'Textured',
})

export function purposeFromGeneric(generic = {}) {
  return Object.entries(PURPOSE_PRESETS).find(([, preset]) =>
    preset.strength === generic.strength && preset.quality === generic.quality)?.[0] || ''
}

export function purposeFromPrintSettings(settings = {}) {
  return Object.keys(PURPOSE_PRESETS).find(purpose => {
    const expected = mapPurposeToConfiguration({ purpose }).printSettings
    return Object.keys(DEFAULT_EDITOR_PRINT_SETTINGS).filter(key => key !== 'materialType')
      .every(key => settings[key] === expected[key])
  }) || ''
}

export function mapPurposeToConfiguration(selection = {}, colours = DEFAULT_PRINT_COLOURS) {
  const purpose = Object.hasOwn(PURPOSE_PRESETS, selection.purpose) ? selection.purpose : ''
  const preset = PURPOSE_PRESETS[purpose] || PURPOSE_PRESETS.Normal
  const material = SIMPLE_MATERIALS.some(m => m.value === selection.material) ? selection.material : 'plastic'
  const colour = selection.colour || DEFAULT_SIMPLE_SELECTION.colour
  const mapped = mapGenericToPrintSettings({ ...preset, colour }, colours)
  return {
    purpose,
    generic: { strength: preset.strength, quality: preset.quality, colour, material },
    printSettings: { ...DEFAULT_EDITOR_PRINT_SETTINGS,
      layerHeight: mapped.layerHeight, initialLayerHeight: mapped.initialLayerHeight,
      wallLoops: mapped.wallLoops, sparseInfillDensity: mapped.sparseInfillDensity,
      materialType: material },
    colourHex: mapped.colourHex,
  }
}

// Only offer colours compatible with a persistable material key. The existing
// catalogue contains wood/marble keys the saved printSettings schema cannot yet
// represent. They remain supported by the legacy generic mapper, not this UI.
export function coloursForMaterial(colours = DEFAULT_PRINT_COLOURS, material = 'plastic') {
  return colours.filter(colour => !colour.material || colour.material === material)
}

export function restorePrintConfiguration(configuration = {}, colours = DEFAULT_PRINT_COLOURS) {
  const printSettings = { ...DEFAULT_EDITOR_PRINT_SETTINGS, ...configuration.printSettings }
  const generic = configuration.generic || {}
  const purpose = purposeFromPrintSettings(printSettings)
  const savedColours = [...new Set(Object.values(configuration.meshColors || {}))]
  const colourName = savedColours.length === 1
    ? colours.find(colour => colour.hex?.toLowerCase() === savedColours[0]?.toLowerCase())?.name : null
  return {
    printSettings,
    selection: { purpose, material: printSettings.materialType,
      colour: savedColours.length > 1 ? 'Custom colours'
        : colourName || generic.colour || (savedColours.length ? 'Custom colours' : DEFAULT_SIMPLE_SELECTION.colour) },
    meshColors: { ...(configuration.meshColors || {}) },
    customSettings: !purpose,
  }
}

// Colour changes must not silently reset detailed print settings. Selecting a
// purpose explicitly replaces them; selecting a material changes only material.
export function applySimpleSelection(current, selection, field, meshNames = [], colours = DEFAULT_PRINT_COLOURS) {
  const mapped = mapPurposeToConfiguration(selection, colours)
  return {
    printSettings: field === 'purpose' ? mapped.printSettings
      : { ...current.printSettings, materialType: selection.material },
    selection,
    meshColors: field === 'colour' && mapped.colourHex
      ? Object.fromEntries(meshNames.map(name => [name, mapped.colourHex]))
      : current.meshColors,
  }
}

// Default colour/material catalogue. `material` (optional) maps to a density key
// the quoting engine understands (see MATERIAL_DENSITIES); plain colours are PLA.
// Admins override this via AppSettings.printColours.
export const DEFAULT_PRINT_COLOURS = Object.freeze([
  { name: 'Wood Colour', hex: '#9b6a3f', material: 'wood' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Black', hex: '#1a1a1a' },
  { name: 'Red', hex: '#d12c2c' },
  { name: 'Green', hex: '#2e8b3d' },
  { name: 'Blue', hex: '#2356c7' },
  { name: 'Transparent', hex: '#e8f4f8', material: 'transparent' },
  { name: 'Yellow', hex: '#f2c200' },
  { name: 'Orange', hex: '#ee7b21' },
  { name: 'Ivory White', hex: '#f5f0e1' },
  { name: 'Natural', hex: '#e9dcc3', material: 'natural' },
  { name: 'Technology Grey', hex: '#6e7479' },
  { name: 'Grey', hex: '#9aa0a6' },
  { name: 'Black Grey', hex: '#3c4043' },
  { name: 'Navy Grey', hex: '#44505c' },
  { name: 'Silvery', hex: '#c7ccd1' },
  { name: 'Orange Yellow', hex: '#f4a300' },
  { name: 'Cherry Pink', hex: '#d6447e' },
  { name: 'Mint Green', hex: '#8fd6b4' },
  { name: 'Bright Green', hex: '#4caf50' },
  { name: 'Mango', hex: '#ffb547' },
  { name: 'Sky Blue', hex: '#7ec8e3' },
  { name: 'Golden', hex: '#d4af37' },
  { name: 'Cyan', hex: '#25c4c4' },
  { name: 'Pink Rose', hex: '#e89bb0' },
  { name: 'Skin', hex: '#e6b89c' },
  { name: 'Sapphire Blue', hex: '#2a4bd7' },
  { name: 'Coffee', hex: '#6f4e37' },
  { name: 'Marble', hex: '#f3f0ea', material: 'marble' },
  { name: 'Light Wood', hex: '#c8a165', material: 'wood' },
  { name: 'Dark Wood', hex: '#5a3a22', material: 'wood' },
])

/**
 * Map a generic selection to concrete print settings + the chosen colour.
 * Unknown strength/quality fall back to defaults; an unknown colour yields a
 * plastic material with no colour override.
 *
 * @param {{strength?:string, quality?:string, colour?:string}} selection
 * @param {Array<{name,hex,material?}>} [colours]
 * @returns {{layerHeight, initialLayerHeight, wallLoops, sparseInfillDensity, materialType, colourHex, colourName}}
 */
export function mapGenericToPrintSettings(
  { strength, quality, colour } = {},
  colours = DEFAULT_PRINT_COLOURS,
) {
  const q = QUALITY_MAP[quality] || QUALITY_MAP[DEFAULT_QUALITY]
  const s = STRENGTH_MAP[strength] || STRENGTH_MAP[DEFAULT_STRENGTH]
  const entry = (colours || []).find(
    (c) => c?.name && colour && c.name.toLowerCase() === String(colour).toLowerCase(),
  )

  return {
    layerHeight: q.layerHeight,
    initialLayerHeight: q.initialLayerHeight,
    wallLoops: s.wallLoops,
    sparseInfillDensity: s.sparseInfillDensity,
    materialType: entry?.material || 'plastic',
    colourHex: entry?.hex || null,
    colourName: entry?.name || null,
  }
}
