export const MAX_PRINT_FILE_BYTES = 25 * 1024 * 1024
export const PRINT_FILE_FORMATS = ['stl', 'obj', '3mf']

export function validatePrintFile(file, formats = PRINT_FILE_FORMATS) {
  if (!file) return 'Choose a 3D model file.'
  const ext = String(file.name || '').split('.').pop().toLowerCase()
  if (!formats.includes(ext)) return `Use a ${formats.map((format) => format.toUpperCase()).join(', ')} file.`
  if (!file.size) return 'This file is empty. Choose a model with printable geometry.'
  if (file.size > MAX_PRINT_FILE_BYTES) return 'File too large. Maximum size is 25 MB.'
  return null
}

// Provenance is descriptive customer-supplied data, never a verified licence.
export function normalizeDesignSource(value) {
  if (!value || typeof value.url !== 'string' || value.url.length > 2048) return null
  try {
    const url = new URL(value.url)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return {
      url: url.href,
      attribution: typeof value.attribution === 'string' ? value.attribution.replace(/[<>\u0000-\u001f]/g, '').slice(0, 300) : '',
    }
  } catch { return null }
}

export function exceedsBuild(dimensionsCm, maxBuildMm) {
  if (!dimensionsCm || !maxBuildMm) return false
  const dims = [dimensionsCm.length, dimensionsCm.width, dimensionsCm.height].map((v) => (Number(v) || 0) * 10).sort((a, b) => b - a)
  const build = [maxBuildMm.x, maxBuildMm.y, maxBuildMm.z].map((v) => Number(v) || 0).sort((a, b) => b - a)
  return dims.some((d, i) => d > build[i])
}
