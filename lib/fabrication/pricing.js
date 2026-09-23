import { FABRICATION_LIMITS, pricingBasisForOffer, validateFabricationCatalog, validateFabricationInput } from './validate'

const reject = (error, path = [], issues) => ({ ok: false, status: 400, error,
  issues: issues || [{ path, message: error }] })
const round = (value, places = 2) => Math.round((value + Number.EPSILON) * 10 ** places) / 10 ** places

/** Pure provider-selling-rate estimate. It is never a charge or production approval. */
export function calculateFabricationEstimate(catalog, input) {
  const checkedCatalog = validateFabricationCatalog(catalog)
  if (!checkedCatalog.ok) return reject(checkedCatalog.error, ['catalog'], checkedCatalog.issues)
  const checkedInput = validateFabricationInput(input)
  if (!checkedInput.ok) return reject(checkedInput.error, [], checkedInput.issues)
  const config = checkedCatalog.value
  const request = checkedInput.value
  if (!config.enabled) return reject('This fabrication catalogue is not published')
  const offer = config.offers.find(item => item.id === request.offerId && item.enabled)
  if (!offer) return reject('This fabrication offer is not available', ['offerId'])
  const material = offer.materials.find(item => item.id === request.materialId)
  if (!material) return reject('Choose a published material and thickness for this offer', ['materialId'])
  const basis = pricingBasisForOffer(offer)
  for (const [key, required] of [['widthMm', basis.requiresWidth], ['heightMm', basis.requiresHeight], ['depthMm', basis.requiresDepth]]) {
    if (required && request[key] === undefined) return reject('Enter ' + key + ' in millimetres for this pricing basis', [key])
  }
  if (basis.id === 'area' && request.depthMm !== undefined) return reject('Sheet thickness comes from the selected material; omit depthMm', ['depthMm'])
  const dimensions = Object.fromEntries(['widthMm', 'heightMm', 'depthMm']
    .filter(key => request[key] !== undefined).map(key => [key, request[key]]))
  if (basis.id === 'area') dimensions.depthMm = material.thicknessMm
  for (const [dimension, limit] of [['widthMm', 'maxWidthMm'], ['heightMm', 'maxHeightMm'], ['depthMm', 'maxDepthMm']]) {
    if (dimensions[dimension] > material[limit]) return reject('The requested ' + dimension + ' exceeds this material’s supported size', [dimension])
  }
  const options = []
  const publishedGroups = new Map(offer.optionGroups.map(group => [group.id, group]))
  for (const groupId of Object.keys(request.selectedOptions)) {
    if (!publishedGroups.has(groupId)) return reject('This option group is not available', ['selectedOptions', groupId])
  }
  for (const group of offer.optionGroups) {
    const choiceId = Object.hasOwn(request.selectedOptions, group.id) ? request.selectedOptions[group.id] : undefined
    if (choiceId === undefined) {
      if (group.required) return reject('Choose an option for ' + group.name, ['selectedOptions', group.id])
      continue
    }
    const choice = group.choices.find(entry => entry.id === choiceId)
    if (!choice) return reject('This choice is not available for ' + group.name, ['selectedOptions', group.id])
    options.push({ groupId: group.id, groupName: group.name, choiceId: choice.id, label: choice.label, priceDelta: choice.priceDelta })
  }
  const optionsPerItem = round(options.reduce((sum, option) => sum + option.priceDelta, 0))
  if (optionsPerItem > FABRICATION_LIMITS.money) return reject('The selected per-item options exceed SGD 100,000')
  // Image ownership and provider-template containment belong to the backend,
  // after it resolves whether the image is the provider's or the customer's.
  const common = {
    currency: 'sgd',
    offer: { id: offer.id, kind: offer.kind, name: offer.name, pricingBasis: basis.id },
    material: { id: material.id, name: material.name, thicknessMm: material.thicknessMm },
    dimensions, quantity: request.quantity, selectedOptions: request.selectedOptions,
    ...(request.personalization ? { personalization: request.personalization } : {}),
    customerNote: request.customerNote,
  }
  if (basis.isManual) return { ok: true, value: { ...common, estimate: {
    basis: 'manual', measurePerItem: null, unit: null, rate: null, processPerItem: null,
    options, optionsPerItem, perItemFee: material.perItemFee, setupFee: material.setupFee,
    subtotal: null, minimumCharge: material.minimumCharge, minimumApplied: false, total: null,
    providerConfirmationRequired: true, manualReviewRequired: true,
  } } }
  const measurePerItem = basis.isVolume ? dimensions.widthMm * dimensions.heightMm * dimensions.depthMm / 1000
    : basis.id === 'area' ? dimensions.widthMm * dimensions.heightMm / 100
      : basis.id === 'length' ? dimensions.widthMm / 10 : 1
  const rate = basis.isVolume ? material.pricePerCm3 : basis.id === 'area' ? material.pricePerCm2
    : basis.id === 'length' ? material.pricePerCm : 0
  const processPerItem = measurePerItem * rate
  const rawSubtotal = (processPerItem + material.perItemFee + optionsPerItem) * request.quantity + material.setupFee
  const rawTotal = Math.max(rawSubtotal, material.minimumCharge)
  if (!Number.isFinite(rawTotal) || rawTotal > FABRICATION_LIMITS.money) return reject('This order needs a provider quote because its estimate exceeds SGD 100,000')
  const total = round(rawTotal)
  if (total < 0.01) return reject('Ask the provider to confirm a selling price for this order')
  return { ok: true, value: {
    ...common,
    estimate: { basis: basis.isVolume ? 'bounding_envelope' : basis.id, measurePerItem, unit: basis.unit,
      rate, processPerItem: round(processPerItem, 6), perItemFee: material.perItemFee,
      options, optionsPerItem,
      setupFee: material.setupFee, subtotal: round(rawSubtotal), minimumCharge: material.minimumCharge,
      minimumApplied: rawSubtotal < material.minimumCharge, total, providerConfirmationRequired: true, manualReviewRequired: false },
  } }
}
