import { bulkCatalogue } from '@/lib/bulkFilament'
import { parseBulkStock } from '@/lib/bulkFilamentStock'
export const fixtureRows = () => [
  { product: 'Lanbo PLA', brand: 'Lanbo', material: 'PLA', colour: 'Black', barcode: '312', quantity: 14 },
  { product: 'Lanbo PLA', brand: 'Lanbo', material: 'PLA', colour: 'White', barcode: '311', quantity: 19 },
  { product: 'Lanbo PLA', brand: 'Lanbo', material: 'PLA', colour: 'Marble', barcode: '838', quantity: 9 },
  { product: 'Lanbo PLA', brand: 'Lanbo', material: 'PLA', colour: 'Wood Colour', barcode: '1000', quantity: 11 },
  { product: 'Lanbo PLA', brand: 'Lanbo', material: 'PLA', colour: 'Technology Grey', barcode: '413', quantity: 9 },
  { product: 'Lanbo PETG', brand: 'Lanbo', material: 'PETG', colour: 'Black', barcode: '332', quantity: 13 },
]
export const fixtureCatalogue = (rows = fixtureRows()) => bulkCatalogue({ items: parseBulkStock(rows), source: 'snapshot', checkedAt: '2026-10-09' })
export const fixtureLine = (catalogue, brand, material, colour, quantity) => {
  const p = catalogue.find(p => p.brand === brand && p.material === material), t = p.types[0]
  return { productId: p.id, version: p.version, options: [{ typeId: t.id, optionId: t.options.find(o => o.name === colour).id }], quantity, remarks: 'Do not fulfil' }
}
export const fixtureInput = (catalogue = fixtureCatalogue()) => ({
  clientRequestId: '12345678-1234-4234-8234-123456789abc', confirmReview: true, consent: true,
  customer: { name: 'Synthetic QA', email: 'qa@example.invalid', phone: '' },
  fulfilment: 'collection', address: '', notes: 'SYNTHETIC TEST ONLY',
  lines: [fixtureLine(catalogue, 'Lanbo', 'PLA', 'Black', 2)],
})
export function memoryStore() {
  const docs = new Map()
  return { docs, async findOne(q) { return docs.get(q._id) || null },
    async insertOne(d) { if (docs.has(d._id)) throw Object.assign(Error('duplicate'), { code: 11000 }); docs.set(d._id, structuredClone(d)) },
    async findOneAndUpdate(q) {
      const doc = docs.get(q._id)
      if (!doc || doc.notifications.email !== q['notifications.email']) return null
      doc.notifications.email = 'sending'; return structuredClone(doc)
    },
    async updateOne(q, update) { const doc = docs.get(q._id); doc.notifications.email = update.$set['notifications.email'] },
  }
}
