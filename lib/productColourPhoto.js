import evidence from './bulkFilamentPreviews.json'
import { PRODUCT_IMAGE_PLACEHOLDER } from './productImage'

const photos = evidence.entries.filter(entry => entry.preview.status === 'verified_official_variant_photo' && entry.photoEvidence)
const photoProducts = new Set(photos.map(entry => entry.productId))

// Reuse exact, reviewed colour identities. These are printed samples, never
// evidence of stocked packaging, quantity or a different material/colour.
export function productColourPhoto(product, selections = {}) {
    const id = String(product?._id || product?.id || '')
    if (!photoProducts.has(id)) return null
    const entries = evidence.entries.filter(entry => entry.productId === id)
    const identity = entries.find(entry => entry.slug === product.slug || entry.slugAliases?.includes(product.slug))
    if (!identity) return null
    const type = product.variantTypes?.find(type => String(type._id || type.id) === identity.colourTypeId)
    const option = type?.options?.find(option => option.name === selections[type.name])
    const entry = option && entries.find(entry => entry.colourTypeId === String(type._id || type.id)
        && entry.optionId === String(option._id || option.id) && entry.originalName === option.name)
    if (!entry || entry.preview.status !== 'verified_official_variant_photo' || !entry.photoEvidence) {
        return { src: PRODUCT_IMAGE_PLACEHOLDER, alt: product.name + ' colour photo unavailable',
            caption: 'Verified photo unavailable for ' + (option?.name || 'this selection') + '.', sourceUrl: null }
    }
    return { src: entry.preview.src, alt: entry.preview.material + ' ' + entry.preview.label + ' official printed colour sample',
        caption: 'Printed colour sample: ' + entry.preview.material + ' / ' + entry.preview.label + '. Spool or refill packaging follows your selection.',
        sourceUrl: entry.preview.sourceUrl }
}
