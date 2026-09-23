import CreatorFabricationService from '@/models/CreatorFabricationService'
import { randomUUID } from 'node:crypto'
import CreatorFabricationOffer from '@/models/CreatorFabricationOffer'
import { validateFabricationCatalog } from './validate'
import { checkedId, fail } from './serverHttp'

let indexReady
async function ensureOfferIndexes() {
  if (!indexReady) indexReady = Promise.all([CreatorFabricationOffer.createIndexes(), CreatorFabricationService.createIndexes()])
    .catch(error => { indexReady = null; throw error })
  await indexReady
}

export function catalogPageOptions(url) {
  const params = new URL(url).searchParams
  const supplied = params.get('limit')
  const limit = supplied == null ? 12 : Number(supplied)
  if (!Number.isInteger(limit) || limit < 1 || limit > 24) fail('Page size must be between 1 and 24.')
  return { limit, cursor: params.get('cursor') ? checkedId(params.get('cursor'), 'page cursor') : null,
    offerId: params.get('offerId') ? checkedId(params.get('offerId'), 'offer ID') : null }
}

export async function fabricationCatalogPage(creatorUserId, { limit = 12, cursor, offerId, publicOnly = false } = {}) {
  const metadata = await CreatorFabricationService.findOne({ creatorUserId }).lean()
  const enabled = metadata?.catalog ? metadata.catalog.enabled === true : metadata?.enabled === true
  if (publicOnly && !enabled) return { catalog: { enabled: false, offers: [] }, nextCursor: null, total: 0 }
  const filter = { creatorUserId, ...(publicOnly ? { enabled: true } : {}) }
  const selection = { ...filter, ...(offerId ? { offerId } : cursor ? { offerId: { $gt: cursor } } : {}) }
  let rows, total
  if (metadata?.catalog && !(await CreatorFabricationOffer.exists({ creatorUserId }))) {
    // The former embedded catalog had at most 24 entries. No unbounded scan.
    const legacy = (metadata.catalog.offers || []).filter(offer => !publicOnly || offer.enabled)
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    total = legacy.length
    rows = legacy.filter(offer => offerId ? offer.id === offerId : !cursor || offer.id > cursor)
      .slice(0, limit + 1).map(offer => ({ offerId: offer.id, offer }))
  } else {
    rows = await CreatorFabricationOffer.find(selection).sort({ offerId: 1 }).limit(offerId ? 1 : limit + 1).lean()
    total = await CreatorFabricationOffer.countDocuments(filter)
  }
  return { catalog: { enabled, offers: rows.slice(0, limit).map(row => row.offer) },
    nextCursor: !offerId && rows.length > limit ? rows[limit - 1].offerId : null, total }
}

export function validateCatalogBatch(body) {
  if (Object.keys(body).some(key => !['catalog', 'removedOfferIds'].includes(key)) ||
      !body.catalog || typeof body.catalog.enabled !== 'boolean') fail('Send a catalog with its enabled setting.')
  // Publishing is global; a page consisting of disabled drafts must still save.
  const result = validateFabricationCatalog({ ...body.catalog, enabled: false })
  if (!result.ok) fail(result.error)
  const removed = body.removedOfferIds || []
  if (!Array.isArray(removed) || removed.length > 24) fail('Remove at most 24 services per save.')
  const ids = removed.map(value => checkedId(value, 'removed offer ID'))
  if (new Set(ids).size !== ids.length || ids.some(id => result.value.offers.some(offer => offer.id === id))) fail('A service cannot be saved and removed in the same batch.')
  return { catalog: { ...result.value, enabled: body.catalog.enabled }, removedOfferIds: ids }
}

export async function saveFabricationCatalogBatch(creatorUserId, catalog, removedOfferIds) {
  await ensureOfferIndexes()
  let existing = await CreatorFabricationService.findOne({ creatorUserId }).lean()
  if (existing?.migrationToken) fail('This catalog is being migrated. Please try again shortly.', 409, 'catalog_migrating')
  let migrationToken
  if (existing?.catalog) {
    const token = randomUUID()
    // Only one first writer can migrate the embedded catalogue. A stale reader
    // must never reinsert legacy rows after a concurrent writer removes them.
    const claimed = await CreatorFabricationService.findOneAndUpdate({ creatorUserId,
      catalog: { $exists: true }, migrationToken: { $exists: false } }, {
      $set: { migrationToken: token, migrationStartedAt: new Date() },
    }, { new: true }).lean()
    if (!claimed) {
      existing = await CreatorFabricationService.findOne({ creatorUserId }).lean()
      if (existing?.catalog || existing?.migrationToken) fail('This catalog is being migrated. Please try again shortly.', 409, 'catalog_migrating')
    } else {
      existing = claimed
      migrationToken = token
    }
  }
  if (migrationToken && existing.catalog?.offers?.length) {
    const legacy = validateFabricationCatalog({ ...existing.catalog, enabled: false })
    if (!legacy.ok) fail('The existing service catalog needs repair before it can be saved.', 409)
    await CreatorFabricationOffer.bulkWrite(legacy.value.offers.map(offer => ({ updateOne: {
      filter: { creatorUserId, offerId: offer.id },
      update: { $setOnInsert: { creatorUserId, offerId: offer.id, enabled: offer.enabled, offer } }, upsert: true,
    } })))
  }
  if (catalog.offers.length) {
    await CreatorFabricationOffer.bulkWrite(catalog.offers.map(offer => ({ updateOne: {
      filter: { creatorUserId, offerId: offer.id },
      update: { $set: { enabled: offer.enabled, offer }, $setOnInsert: { creatorUserId, offerId: offer.id } }, upsert: true,
    } })))
  }
  if (removedOfferIds.length) await CreatorFabricationOffer.deleteMany({ creatorUserId, offerId: { $in: removedOfferIds } })
  const saved = await CreatorFabricationService.findOneAndUpdate({ creatorUserId,
    migrationToken: migrationToken || { $exists: false } }, {
    $set: { enabled: catalog.enabled }, $unset: { catalog: 1, migrationToken: 1, migrationStartedAt: 1 },
    $setOnInsert: { creatorUserId }, $inc: { revision: 1 },
  }, { upsert: !migrationToken, new: true, runValidators: true }).lean()
  if (!saved) fail('This catalog changed during migration. Reload before saving.', 409, 'catalog_migrating')
  return catalog
}
