import { connectToDatabase } from '@/lib/db'
import Product from '@/models/Product'
import { cleanProductCopy } from '@/lib/productPublicContent'

export function productCopyChange(product) {
    const clean = cleanProductCopy(product)
    const before = {}, after = {}
    if (clean.description !== product.description) {
        before.description = product.description
        after.description = clean.description
    }
    for (const [index, option] of (product.delivery?.deliveryTypes || []).entries()) {
        const value = clean.delivery.deliveryTypes[index].customDescription
        if (value !== option.customDescription) {
            const path = `delivery.deliveryTypes.${index}.customDescription`
            before[path] = option.customDescription
            after[path] = value
        }
    }
    return Object.keys(after).length ? { productId: product._id, name: product.name, slug: product.slug, before, after } : null
}

export async function catalogueCopyCleanup({ apply = false, userId } = {}) {
    const database = await connectToDatabase()
    const products = await Product.find({ productType: 'shop' })
        .select('_id name slug description delivery').limit(2001).lean()
    if (products.length > 2000) throw new Error('Catalogue exceeds cleanup batch limit')
    const changes = products.map(productCopyChange).filter(Boolean)
    const summary = {
        scanned: products.length,
        affected: changes.length,
        productDescriptions: changes.filter(change => Object.hasOwn(change.after, 'description')).length,
        deliveryDescriptions: changes.reduce((count, change) => count + Object.keys(change.after).filter(key => key.startsWith('delivery.')).length, 0),
    }
    if (!apply) return { ...summary, examples: changes.slice(0, 5) }
    if (!changes.length) return { ...summary, updated: 0, skipped: 0 }

    // Save the original text privately before writing. This collection is never
    // returned by catalogue APIs. Compare old field values to preserve live edits.
    const history = database.connection.db.collection('catalogueCopyCleanupRuns')
    const backup = await history.insertOne({ createdAt: new Date(), userId, status: 'prepared', changes })
    const result = await Product.bulkWrite(changes.map(change => ({ updateOne: {
        filter: { _id: change.productId, ...change.before },
        update: { $set: change.after },
    } })))
    const updated = result.modifiedCount
    await history.updateOne({ _id: backup.insertedId }, { $set: { status: 'completed', updated, completedAt: new Date() } })
    return { ...summary, updated, skipped: changes.length - updated, backupId: String(backup.insertedId) }
}
