import { DEFAULT_EDITOR_PRINT_SETTINGS, QUALITY_MAP, STRENGTH_MAP } from '@/lib/quoting/genericPresets'

export const MUTABLE_PRINT_STATUSES = ['pending_upload', 'pending_config', 'configured', 'quoted']
export class PrintConfigurationError extends Error {}
const fail = message => { throw new PrintConfigurationError(message) }
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
const enums = {
  materialType: ['plastic', 'resin', 'metal', 'sandstone'],
  filamentType: ['pla', 'pla_matte', 'petg', 'asa', 'abs', 'tpu'],
  nozzleDiameter: [0.2, 0.4, 0.6, 0.8],
  internalSolidInfillPattern: ['Rectilinear', 'Concentric', 'Monotonic', 'Monotonic line', 'Aligned Rectilinear'],
  sparseInfillPattern: ['Rectilinear', 'Grid', 'HoneyComb', 'Triangles', 'Lightning', 'Concentric', 'Aligned Rectilinear'],
  supportType: ['Tree', 'Normal'], printPlate: ['Textured', 'Smooth'],
}
const numbers = { layerHeight: [0.08, 0.4], initialLayerHeight: [0.08, 0.4],
  wallLoops: [1, 10], sparseInfillDensity: [0, 100] }

// Produces only server-approved fields; configuration dates/flags are server-owned.
export function validatePrintConfiguration(input, { creator = false, partial = false } = {}) {
  if (!plain(input)) fail('Print configuration must be an object')
  const result = { meshColors: {} }
  if (input.meshColors !== undefined) {
    if (!plain(input.meshColors) || Object.keys(input.meshColors).length > 200) fail('Invalid model colours')
    for (const [name, hex] of Object.entries(input.meshColors)) {
      if (!name || name.length > 150 || /[.$]/.test(name) || ['__proto__', 'constructor', 'prototype'].includes(name)
        || typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) fail('Invalid model colour')
      result.meshColors[name] = hex.toLowerCase()
    }
  }
  if (input.printSettings !== undefined || !partial) {
    if (!plain(input.printSettings)) fail('Print settings are required')
    const ps = { ...DEFAULT_EDITOR_PRINT_SETTINGS, ...input.printSettings }
    result.printSettings = {}
    for (const key of Object.keys(DEFAULT_EDITOR_PRINT_SETTINGS)) {
      const value = ps[key]
      if (numbers[key]) {
        const [min, max] = numbers[key]
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
          || (key === 'wallLoops' && !Number.isInteger(value))) fail('Invalid ' + key)
      } else if (enums[key]) {
        if (!enums[key].includes(value)) fail('Invalid ' + key)
      } else if (key === 'enableSupport' && typeof value !== 'boolean') fail('Invalid support setting')
      result.printSettings[key] = value
    }
    if (ps.layerHeight > ps.nozzleDiameter || ps.initialLayerHeight > ps.nozzleDiameter) fail('Layer height cannot exceed the nozzle diameter')
  }
  if (input.generic != null) {
    if (!plain(input.generic)) fail('Invalid simple print settings')
    const generic = {}
    for (const key of ['strength', 'quality', 'colour', 'material', 'filament']) {
      const value = input.generic[key]
      if (value == null) continue
      if (typeof value !== 'string' || !value.trim() || value.length > 80 || /[<>\x00-\x1f]/.test(value)) fail('Invalid ' + key)
      generic[key] = value.trim()
    }
    if (generic.strength && !Object.hasOwn(STRENGTH_MAP, generic.strength)) fail('Invalid print purpose')
    if (generic.quality && !Object.hasOwn(QUALITY_MAP, generic.quality)) fail('Invalid print quality')
    if (!creator && generic.material && !enums.materialType.includes(generic.material)) fail('Invalid material')
    if (!creator && generic.filament && !enums.filamentType.includes(generic.filament)) fail('Invalid filament')
    const settings = result.printSettings
    if (settings && !creator) {
      if (generic.material && generic.material !== settings.materialType) fail('Material does not match print settings')
      if (generic.filament && generic.filament !== settings.filamentType) fail('Filament does not match print settings')
      const strength = STRENGTH_MAP[generic.strength]
      const quality = QUALITY_MAP[generic.quality]
      if ((strength && Object.entries(strength).some(([key, value]) => settings[key] !== value))
        || (quality && Object.entries(quality).some(([key, value]) => settings[key] !== value))) fail('Purpose does not match print settings')
    }
    result.generic = generic
  }
  return result
}
