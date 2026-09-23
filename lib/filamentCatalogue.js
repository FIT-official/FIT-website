// These are the filament families sold through FIT's print request, not every
// filament or part in the inventory workbook.
export const FILAMENTS = Object.freeze([
  { value: 'pla', label: 'PLA', category: 'PLA Basic' },
  { value: 'pla_matte', label: 'PLA Matte', category: 'PLA Matte' },
  { value: 'petg', label: 'PETG', category: 'PETG Basic' },
  { value: 'asa', label: 'ASA', category: 'ASA' },
  { value: 'abs', label: 'ABS', category: 'ABS' },
  { value: 'tpu', label: 'TPU', category: 'TPU' },
])

// Manufacturer colour codes identify colours across spool and refill rows.
// Hex values are display swatches; availability always comes from the sheet.
export const FILAMENT_COLOURS = Object.freeze([
  ['pla', 'Jade White', '10100', '#ffffff'], ['pla', 'Black', '10101', '#000000'],
  ['pla', 'Silver', '10102', '#a6a9aa'], ['pla', 'Gray', '10103', '#8e9089'],
  ['pla', 'Light Gray', '10104', '#d1d3d5'], ['pla', 'Dark Gray', '10105', '#545454'],
  ['pla', 'Red', '10200', '#c12e1f'], ['pla', 'Beige', '10201', '#f7e6de'],
  ['pla', 'Magenta', '10202', '#ec008c'], ['pla', 'Pink', '10203', '#f55a74'],
  ['pla', 'Hot Pink', '10204', '#f5547c'], ['pla', 'Maroon Red', '10205', '#9d2235'],
  ['pla', 'Orange', '10300', '#ff6a13'], ['pla', 'Pumpkin Orange', '10301', '#ff9016'],
  ['pla', 'Yellow', '10400', '#f4ee2a'], ['pla', 'Gold', '10401', '#e4bd68'],
  ['pla', 'Sunflower Yellow', '10402', '#fec600'],
  ['pla', 'Green', '10501', '#00ae42'], ['pla', 'Mistletoe Green', '10502', '#3f8e43'],
  ['pla', 'Blue Gray', '10602', '#5b6579'], ['pla', 'Cyan', '10603', '#0086d6'],
  ['pla', 'Cobalt Blue', '10604', '#0056b8'], ['pla', 'Purple', '10700', '#5e43b7'],
  ['pla', 'Indigo Purple', '10701', '#482960'], ['pla', 'Bronze', '10801', '#847d48'],
  ['pla', 'Brown', '10800', '#9d432c'], ['pla', 'Cocoa Brown', '10802', '#6f5034'],
  ['pla_matte', 'Ivory White', '11100', '#f2f0e6'],
  ['pla_matte', 'Charcoal', '11101', '#373737'], ['pla_matte', 'Ash Gray', '11102', '#9da0a0'],
  ['pla_matte', 'Nardo Gray', '11104', '#868b8c'], ['pla_matte', 'Sakura Pink', '11201', '#e5aab3'],
  ['pla_matte', 'Lemon Yellow', '11400', '#f8df58'], ['pla_matte', 'Sky Blue', '11601', '#93bfda'],
  ['petg', 'White', '30106', '#f7f7f4'], ['petg', 'Black', '30105', '#171717'],
  ['asa', 'White', '45100', '#f7f7f4'], ['asa', 'Gray', '45102', '#85898b'],
  ['abs', 'White', '40100', '#f7f7f4'],
  ['tpu', 'White', 'tpu-white', '#ffffff'], ['tpu', 'Yellow', 'tpu-yellow', '#f3e600'],
  ['tpu', 'Blue', 'tpu-blue', '#0072ce'], ['tpu', 'Red', 'tpu-red', '#c8102e'],
  ['tpu', 'Gray', 'tpu-gray', '#898d8d'], ['tpu', 'Black', 'tpu-black', '#101820'],
].map(([filament, name, code, hex]) => ({ filament, name, code, hex })))

export const DEFAULT_FIT_COLOURS = Object.freeze(FILAMENT_COLOURS.map(item => ({ ...item, stockStatus: 'unknown' })))
