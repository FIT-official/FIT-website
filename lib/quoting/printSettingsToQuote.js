/**
 * Map a stored print configuration (CustomPrintRequest/Product `printSettings`
 * shape: layerHeight, sparseInfillDensity, nozzleDiameter, …) to the Instant
 * Quoting Engine's `settings` shape (layerHeightMm, infillPercent, nozzleMm, …).
 *
 * Pure. Extracted from the editor (components/Editor/result.jsx) so the server
 * can compute a quote from a product's fixed print config without the editor.
 */
export function printSettingsToQuoteSettings(printSettings = {}, { materialType } = {}) {
  return {
    materialType: materialType ?? (printSettings.materialType === 'plastic'
      ? (printSettings.filamentType === 'pla_matte' ? 'pla' : printSettings.filamentType || 'plastic')
      : printSettings.materialType),
    infillPercent: printSettings.sparseInfillDensity,
    wallLoops: printSettings.wallLoops,
    nozzleMm: printSettings.nozzleDiameter,
    layerHeightMm: printSettings.layerHeight,
    enableSupport: printSettings.enableSupport,
  }
}
