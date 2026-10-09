// Customer intake choices, not a supported-service list or a diagnosis.
// Vendor taxonomy verified 2026-09-30. Exact HMS/error codes deliberately stay free text.
export const REPAIR_BRANDS = [['bambu_lab', 'Bambu Lab'], ['prusa', 'Prusa'], ['creality', 'Creality'], ['anycubic', 'Anycubic'], ['elegoo', 'ELEGOO'], ['flashforge', 'Flashforge'], ['ultimaker', 'UltiMaker'], ['other', 'Other'], ['not_sure', 'Not sure']]
const fallbackModels = [['other', 'Other model — enter below'], ['not_sure', 'Not sure']]
export const REPAIR_MODELS = {
  bambu_lab: [['a1', 'A1'], ['a1_mini', 'A1 mini'], ['p1p', 'P1P'], ['p1s', 'P1S'], ['p2s', 'P2S'], ['x1', 'X1'], ['x1_carbon', 'X1 Carbon'], ['x1e', 'X1E'], ['h2d', 'H2D'], ['h2s', 'H2S'], ['h2c', 'H2C'], ...fallbackModels],
  prusa: [['core_one', 'CORE One'], ['core_one_plus', 'CORE One+'], ['core_one_gen2', 'CORE One+ (Gen 2)'], ['core_one_l', 'CORE One L'], ['core_one_l_plus', 'CORE One L+'], ['mk4s', 'MK4S'], ['mk4', 'MK4'], ['mk39s', 'MK3.9S'], ['mk39', 'MK3.9'], ['mk35s', 'MK3.5S'], ['mk35', 'MK3.5'], ['mk3s_plus', 'MK3S+'], ['mk3s', 'MK3S'], ['mk3', 'MK3'], ['mini_plus', 'MINI+'], ['mini', 'MINI'], ['xl', 'XL'], ['xl_plus', 'XL+'], ...fallbackModels],
}
export const REPAIR_FEEDERS = {
  bambu_lab: [['none', 'No external feeder'], ['ams', 'AMS'], ['ams_lite', 'AMS lite'], ['ams_2_pro', 'AMS 2 Pro'], ['ams_ht', 'AMS HT'], ['other', 'Another feeder'], ['not_sure', 'Not sure']],
  prusa: [['none', 'No MMU'], ['mmu', 'MMU installed'], ['other', 'Another feeder'], ['not_sure', 'Not sure']],
}
export const REPAIR_GUIDANCE = {
  bambu_lab: { lastVerified: '2026-09-30', links: [['H2C user manual', 'https://csm.bblcdn.com/hub/eff78da43720461787dc8bbe5fa0372d.pdf'], ['Bambu Lab model information', 'https://blog.bambulab.com/the-icon-redefined-meet-the-p2s-a-completely-reengineered-version-of-the-ultra-productive-p1-series/'], ['X1 series information', 'https://blog.bambulab.com/the-x1-series-is-eol-the-standard-it-set-will-remain-forever/']] },
  prusa: { lastVerified: '2026-09-30', links: [['Prusa troubleshooting', 'https://help.prusa3d.com/category/troubleshooting_194'], ['Prusa error-code guides', 'https://help.prusa3d.com/category/qr-error-codes_1167'], ['Prusa model information', 'https://www.prusa3d.com/category/3d-printers/']] },
}
const endings = [['maintenance', 'Maintenance enquiry'], ['other', 'Something else'], ['not_sure', 'Not sure']]
export const REPAIR_ISSUES = [['filament_feed', 'Filament feeding or extrusion'], ['first_layer', 'First layer or bed adhesion'], ['print_quality', 'Print quality'], ['movement', 'Movement or calibration'], ['temperature', 'Heating or temperature warning'], ['error_message', 'Error message or firmware'], ['not_starting', 'Printer will not start'], ...endings]
// Optional observations only: no component diagnosis or model-specific code.
export const REPAIR_SPECIFIC_SYMPTOMS = {
  filament_feed: [['loading', 'Filament will not load'], ['stops', 'Feeding stops during a print'], ['extrusion', 'Little or no filament comes out']],
  first_layer: [['adhesion', 'The print does not stick'], ['uneven', 'The first layer looks uneven']],
  print_quality: [['gaps', 'Gaps or missing layers'], ['strings', 'Strings between parts of the print'], ['shifted', 'The print shifts or loses its shape']],
  movement: [['homing', 'Homing does not finish'], ['calibration', 'Calibration does not finish'], ['noise', 'Unusual movement or noise']],
  temperature: [['heating', 'Heating does not finish'], ['warning', 'A temperature warning appears']],
}
export function repairSpecificOptions(issue) { return Object.hasOwn(REPAIR_SPECIFIC_SYMPTOMS, issue) ? [...REPAIR_SPECIFIC_SYMPTOMS[issue], ['other', 'Another symptom'], ['not_sure', 'Not sure']] : [] }
export function repairIssueOptions({ brandChoice, modelChoice, feeder }) {
  if (brandChoice === 'bambu_lab') return [
    ['filament_feed', 'Filament feeding or extrusion'], ['first_layer', 'First layer or bed adhesion'], ['print_quality', 'Print quality'], ['movement', 'Movement or calibration'], ['temperature', 'Heating or temperature warning'],
    ...(['ams', 'ams_lite', 'ams_2_pro', 'ams_ht'].includes(feeder) ? [['ams', 'AMS feeding or filament changing']] : []),
    ['network', 'Wi-Fi, app or sending a print'], ['error_message', 'Screen, startup or firmware'],
    ...(modelChoice === 'h2c' ? [['hotend_switch', 'Hotend switching or hotend rack']] : []), ...endings,
  ]
  if (brandChoice === 'prusa') return [
    ['filament_feed', 'Extrusion or filament sensor'], ['first_layer', 'First layer or bed adhesion'], ['print_quality', 'Print quality'], ['movement', 'Homing, movement or calibration'], ['temperature', 'Heating or temperature warning'], ['fan', 'Fan or cooling'],
    ...(feeder === 'mmu' ? [['mmu', 'MMU loading or unloading']] : []), ...(['xl', 'xl_plus'].includes(modelChoice) ? [['tool_change', 'Toolhead or tool changing']] : []),
    ['network', 'Prusa Connect, Link or network'], ['error_message', 'Firmware or error message'], ...endings,
  ]
  return REPAIR_ISSUES
}
export function reconcileRepairSelection(brief, field, value) {
  const next = { ...brief, [field]: value }
  let changed = false
  if (field === 'brandChoice') {
    next.brand = value === 'other' ? brief.brandOther.trim() : REPAIR_BRANDS.find(([key]) => key === value)?.[1] || ''
    next.modelChoice = REPAIR_MODELS[value] ? '' : 'other'
    next.model = ''
    next.feeder = 'not_sure'
    changed = Boolean(brief.model || brief.issue)
  }
  if (field === 'brandOther' && next.brandChoice === 'other') next.brand = value.trim()
  if (field === 'modelChoice') next.model = value === 'other' ? '' : REPAIR_MODELS[next.brandChoice]?.find(([key]) => key === value)?.[1] || ''
  if (next.issue && !repairIssueOptions(next).some(([key]) => key === next.issue)) { next.issue = ''; changed = true }
  if (field === 'issue' || (next.specificSymptom && !repairSpecificOptions(next.issue).some(([key]) => key === next.specificSymptom))) next.specificSymptom = ''
  return { brief: next, notice: changed ? 'The printer selection changed. Check the model and choose the issue again if needed. Your description, error message and photos are kept.' : '' }
}
