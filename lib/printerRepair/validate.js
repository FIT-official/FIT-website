export const REPAIR_PHOTO_LIMIT = 3
export const REPAIR_PHOTO_BYTES = 3 * 1024 * 1024
export const REPAIR_ISSUES = [
  ['print_quality', 'Print quality'], ['filament_feed', 'Filament feeding or extrusion'],
  ['error_message', 'Error message'], ['not_starting', 'Printer will not start'],
  ['maintenance', 'Maintenance enquiry'], ['other', 'Something else'],
]
export const REPAIR_AUDIENCES = [['individual', 'Personal printer'], ['school', 'School or teaching'], ['company', 'Company'], ['public_sector', 'Government or public organisation']]
export const EMPTY_REPAIR_BRIEF = { brand: '', model: '', issue: '', details: '', errorCode: '', troubleshooting: '', contactName: '', email: '', phone: '', audience: 'individual', organisation: '', preferredDate: '', handover: 'discuss_with_fit' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const textFields = { brand: 80, model: 120, details: 2000, errorCode: 200, troubleshooting: 2000, contactName: 100, email: 254, phone: 40, organisation: 120 }
export function singaporeToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key).value).join('-')
}
export function validateRepairBrief(input, { step, today } = {}) {
  const errors = {}, value = { ...EMPTY_REPAIR_BRIEF }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: { form: 'Enter your printer details.' } }
  for (const [field, maximum] of Object.entries(textFields)) {
    if (typeof input[field] !== 'string' || input[field].length > maximum || /[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input[field])) errors[field] = `Use plain text, up to ${maximum} characters.`
    else value[field] = input[field].trim()
  }
  value.issue = input.issue
  value.audience = input.audience
  value.handover = input.handover
  value.preferredDate = input.preferredDate
  if (!value.brand) errors.brand = 'Enter the printer brand, or say unsure.'
  if (!value.model) errors.model = 'Enter the model, or say unsure.'
  if (!REPAIR_ISSUES.some(([key]) => key === value.issue)) errors.issue = 'Choose the closest description.'
  if (value.details.length < 10) errors.details = 'Tell us what happens, in at least 10 characters.'
  if (!value.contactName) errors.contactName = 'Enter your name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) errors.email = 'Enter an email address we can reply to.'
  if (value.phone && !/^[+\d ()-]{6,40}$/.test(value.phone)) errors.phone = 'Use digits, spaces, +, brackets or hyphens.'
  if (!REPAIR_AUDIENCES.some(([key]) => key === value.audience)) errors.audience = 'Choose who the request is for.'
  if (value.handover !== 'discuss_with_fit') errors.handover = 'Discuss the handover arrangement with FIT.'
  if (typeof value.preferredDate !== 'string' || (value.preferredDate && (!/^\d{4}-\d{2}-\d{2}$/.test(value.preferredDate) || !Number.isFinite(Date.parse(value.preferredDate)) || new Date(value.preferredDate).toISOString().slice(0, 10) !== value.preferredDate))) errors.preferredDate = 'Enter a valid date, or leave this blank.'
  else if (today && value.preferredDate && value.preferredDate < today) errors.preferredDate = 'Choose today or a future date, or leave this blank.'
  const groups = { 0: ['brand', 'model', 'issue', 'details', 'errorCode'], 1: ['troubleshooting'], 2: ['contactName', 'email', 'phone', 'audience', 'organisation', 'preferredDate', 'handover'] }
  const relevant = step === undefined ? errors : Object.fromEntries(Object.entries(errors).filter(([field]) => groups[step]?.includes(field)))
  return { ok: !Object.keys(relevant).length, errors: relevant, value }
}
export function validateRepairSubmission(body) {
  const allowed = ['clientRequestId', 'brief', 'photoAssetIds']
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) return { ok: false, error: 'Unsupported request fields.' }
  if (typeof body.clientRequestId !== 'string' || !UUID.test(body.clientRequestId)) return { ok: false, error: 'A valid request ID is required.' }
  if (!body.brief || Object.keys(body.brief).some(key => !Object.hasOwn(EMPTY_REPAIR_BRIEF, key))) return { ok: false, error: 'Unsupported printer brief fields.' }
  const checked = validateRepairBrief(body.brief)
  if (!checked.ok) return { ok: false, error: Object.values(checked.errors)[0], errors: checked.errors }
  const ids = body.photoAssetIds
  if (!Array.isArray(ids) || ids.length > REPAIR_PHOTO_LIMIT || ids.some(id => typeof id !== 'string' || !UUID.test(id)) || new Set(ids.map(id => id.toLowerCase())).size !== ids.length) return { ok: false, error: 'Attach up to three different photos.' }
  return { ok: true, value: { clientRequestId: body.clientRequestId.toLowerCase(), brief: checked.value, photoAssetIds: ids.map(id => id.toLowerCase()) } }
}
export function repairPhotoError(file) {
  if (!file || !file.size || file.size > REPAIR_PHOTO_BYTES) return 'Each photo must be between 1 byte and 3 MB.'
  const extensions = { 'image/jpeg': /\.(jpg|jpeg)$/i, 'image/png': /\.png$/i, 'image/webp': /\.webp$/i }
  if (!extensions[file.type]?.test(file.name)) return 'Choose a JPEG, PNG or WebP photo.'
  return ''
}
