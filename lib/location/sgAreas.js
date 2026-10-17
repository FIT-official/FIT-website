// Singapore URA Master Plan planning areas (55), alphabetical. A neutral list for the optional "Area" field.
export const PLANNING_AREAS = Object.freeze(['Ang Mo Kio', 'Bedok', 'Bishan', 'Boon Lay', 'Bukit Batok', 'Bukit Merah', 'Bukit Panjang', 'Bukit Timah', 'Central Water Catchment', 'Changi', 'Changi Bay', 'Choa Chu Kang', 'Clementi', 'Downtown Core', 'Geylang', 'Hougang', 'Jurong East', 'Jurong West', 'Kallang', 'Lim Chu Kang', 'Mandai', 'Marina East', 'Marina South', 'Marine Parade', 'Museum', 'Newton', 'North-Eastern Islands', 'Novena', 'Orchard', 'Outram', 'Pasir Ris', 'Paya Lebar', 'Pioneer', 'Punggol', 'Queenstown', 'River Valley', 'Rochor', 'Seletar', 'Sembawang', 'Sengkang', 'Serangoon', 'Simpang', 'Singapore River', 'Southern Islands', 'Straits View', 'Sungei Kadut', 'Tampines', 'Tanglin', 'Tengah', 'Toa Payoh', 'Tuas', 'Western Islands', 'Western Water Catchment', 'Woodlands', 'Yishun'])

// Offline lookup, committed to the repo (no external API at runtime).
// 2-digit postal sector -> postal district (01-28) -> the planning area that covers most of that sector.
// APPROXIMATE: postal sectors do not follow planning-area boundaries, so this is only a suggestion;
// the user can always override the auto-filled area.
export const POSTAL_DISTRICT_SECTORS = Object.freeze({
  '01': ['01', '02', '03', '04', '05', '06'], '02': ['07', '08'], '03': ['14', '15', '16'], '04': ['09', '10'], '05': ['11', '12', '13'],
  '06': ['17'], '07': ['18', '19'], '08': ['20', '21'], '09': ['22', '23'], '10': ['24', '25', '26', '27'], '11': ['28', '29', '30'],
  '12': ['31', '32', '33'], '13': ['34', '35', '36', '37'], '14': ['38', '39', '40', '41'], '15': ['42', '43', '44', '45'], '16': ['46', '47', '48'],
  '17': ['49', '50', '81'], '18': ['51', '52'], '19': ['53', '54', '55', '82'], '20': ['56', '57'], '21': ['58', '59'], '22': ['60', '61', '62', '63', '64'],
  '23': ['65', '66', '67', '68'], '24': ['69', '70', '71'], '25': ['72', '73'], '26': ['77', '78'], '27': ['75', '76'], '28': ['79', '80'],
})
export const POSTAL_SECTOR_AREA = Object.freeze({
  '01': 'Downtown Core', '02': 'Downtown Core', '03': 'Downtown Core', '04': 'Downtown Core', '05': 'Outram', '06': 'Outram',
  '07': 'Downtown Core', '08': 'Downtown Core', '09': 'Bukit Merah', '10': 'Bukit Merah', '11': 'Queenstown', '12': 'Clementi', '13': 'Clementi',
  '14': 'Queenstown', '15': 'Bukit Merah', '16': 'Bukit Merah', '17': 'Downtown Core', '18': 'Rochor', '19': 'Rochor', '20': 'Rochor', '21': 'Kallang',
  '22': 'River Valley', '23': 'Orchard', '24': 'Tanglin', '25': 'Tanglin', '26': 'Bukit Timah', '27': 'Bukit Timah', '28': 'Bukit Timah', '29': 'Novena', '30': 'Novena',
  '31': 'Toa Payoh', '32': 'Novena', '33': 'Kallang', '34': 'Geylang', '35': 'Toa Payoh', '36': 'Geylang', '37': 'Geylang', '38': 'Geylang', '39': 'Geylang', '40': 'Geylang', '41': 'Geylang',
  '42': 'Marine Parade', '43': 'Marine Parade', '44': 'Marine Parade', '45': 'Bedok', '46': 'Bedok', '47': 'Bedok', '48': 'Bedok', '49': 'Changi', '50': 'Changi', '51': 'Pasir Ris', '52': 'Tampines',
  '53': 'Hougang', '54': 'Sengkang', '55': 'Serangoon', '56': 'Ang Mo Kio', '57': 'Bishan', '58': 'Bukit Timah', '59': 'Bukit Timah',
  '60': 'Jurong East', '61': 'Jurong East', '62': 'Jurong West', '63': 'Pioneer', '64': 'Jurong West', '65': 'Bukit Batok', '66': 'Bukit Batok', '67': 'Bukit Panjang', '68': 'Choa Chu Kang',
  '69': 'Lim Chu Kang', '70': 'Tengah', '71': 'Lim Chu Kang', '72': 'Sungei Kadut', '73': 'Woodlands', '75': 'Sembawang', '76': 'Yishun', '77': 'Ang Mo Kio', '78': 'Ang Mo Kio',
  '79': 'Seletar', '80': 'Serangoon', '81': 'Changi', '82': 'Punggol',
})

export const isPlanningArea = value => typeof value === 'string' && PLANNING_AREAS.includes(value)
export const normalisePostalCode = value => String(value ?? '').replace(/\s+/g, '')
export const isSgPostalCode = value => /^\d{6}$/.test(normalisePostalCode(value)) && Object.hasOwn(POSTAL_SECTOR_AREA, normalisePostalCode(value).slice(0, 2))
export function postalDistrict(postalCode) {
  if (!isSgPostalCode(postalCode)) return null
  const sector = normalisePostalCode(postalCode).slice(0, 2)
  return Object.keys(POSTAL_DISTRICT_SECTORS).find(d => POSTAL_DISTRICT_SECTORS[d].includes(sector)) || null
}
// Suggested planning area for a 6-digit SG postal code (approximate; the user may override), or '' if unknown.
export function areaFromPostalCode(postalCode) {
  return isSgPostalCode(postalCode) ? POSTAL_SECTOR_AREA[normalisePostalCode(postalCode).slice(0, 2)] : ''
}