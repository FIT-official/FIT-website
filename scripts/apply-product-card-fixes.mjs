#!/usr/bin/env node
// node scripts/apply-product-card-fixes.mjs --manifest /private/manifest.json
// Dry-run by default. --apply is the only write path. No admin, Stripe or Sheet calls.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import dotenv from 'dotenv'

const approvedPrices = new Map([
    ['37-in-1-sensor-kit', [24.90, false]],
    ['copper-stripboard-65145cm-254mm', [2.40, false]],
    ['esp32-wroomdevkit-30pin', [10.30, true]],
    ['tft-ili9341-240-x-320-28-inch', [12.90, true]],
])
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const requiredStorage = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'NEXT_PUBLIC_S3_BUCKET_NAME']

export function validateManifest(manifest) {
    if (manifest.version !== 1 || !Number.isSafeInteger(manifest.createdAtMs) || manifest.createdAtMs <= 0 ||
        !Array.isArray(manifest.images) || !Array.isArray(manifest.prices)) throw new Error('Invalid manifest structure')
    const seenImages = new Set(), seenPrices = new Set()
    for (const row of manifest.images) {
        if (!/^[a-z0-9-]+$/.test(row.slug) || seenImages.has(row.slug) || !['READY', 'UNCERTAIN'].includes(row.status)) throw new Error('Invalid or duplicate image entry')
        seenImages.add(row.slug)
        if (row.status !== 'READY') continue
        if (!['taobao', 'supplier'].includes(row.sourceType) || !/^https:\/\//.test(row.sourceLink) || !row.matchNotes ||
            typeof row.expectedFirstImage !== 'string' || !Array.isArray(row.files) || !row.files.length || row.files.length > 7) throw new Error(`Incomplete READY entry: ${row.slug}`)
        for (const file of row.files) {
            if (typeof file.path !== 'string' || !file.path || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error(`Invalid file: ${row.slug}`)
        }
    }
    for (const row of manifest.prices) {
        const approved = approvedPrices.get(row.slug)
        if (seenPrices.has(row.slug) || !approved || row.amount !== approved[0] || row.quoteOnly !== approved[1] || row.currency !== 'SGD') throw new Error('Unapproved or duplicate price entry')
        seenPrices.add(row.slug)
    }
    return manifest
}

export async function prepareImages(manifest, directory) {
    const sharp = (await import('sharp')).default
    const prepared = new Map()
    for (const row of manifest.images.filter(row => row.status === 'READY')) {
        const files = []
        for (const file of row.files) {
            const body = await readFile(path.resolve(directory, file.path))
            const digest = createHash('sha256').update(body).digest('hex')
            if (digest !== file.sha256) throw new Error(`Image checksum changed: ${row.slug}`)
            const metadata = await sharp(body).metadata()
            if (!['jpeg', 'png'].includes(metadata.format) || !metadata.width || !metadata.height || body.length > 5 * 1024 * 1024) throw new Error(`Unsupported image: ${row.slug}`)
            // Same images/<timestamp>-<suffix>.<ext> scheme as /api/upload/images.
            // A content hash replaces randomness, so retries reuse the same key.
            const ext = metadata.format === 'jpeg' ? 'jpg' : 'png'
            files.push({ key: `images/${manifest.createdAtMs}-${digest}.${ext}`, body, digest, contentType: `image/${metadata.format}` })
        }
        prepared.set(row.slug, files)
    }
    return prepared
}

export function planChanges(manifest, products, prepared) {
    const slugs = new Set([...prepared.keys(), ...manifest.prices.map(row => row.slug)])
    return [...slugs].map(slug => {
        const matches = products.filter(product => product.slug === slug)
        if (matches.length !== 1) throw new Error(`Expected exactly one product: ${slug}`)
        const product = matches[0], changes = {}, filter = { _id: product._id, slug }
        const files = prepared.get(slug)
        if (files) {
            const desired = files.map(file => file.key)
            if (!equal(product.images, desired)) {
                const row = manifest.images.find(row => row.slug === slug)
                if ((product.images?.[0] || '') !== row.expectedFirstImage) throw new Error(`Image changed since audit: ${slug}`)
                changes.images = desired
                filter.images = product.images ?? { $exists: false }
            }
        }
        const price = manifest.prices.find(row => row.slug === slug)
        if (price) {
            if (product.basePrice?.presentmentCurrency !== 'SGD') throw new Error(`Expected SGD base price: ${slug}`)
            // Variants remain additive. Do not silently reinterpret a base price as a total.
            if ((product.variantTypes || []).some(type => (type.options || []).some(option => Number(option.additionalFee || 0) !== 0))) throw new Error(`Variant price review required: ${slug}`)
            if (product.stripePriceId || product.stripePriceIds) throw new Error(`Stripe price review required: ${slug}`)
            if (price.quoteOnly && product.quoteOnly !== true) throw new Error(`Expected quoteOnly to remain ON: ${slug}`)
            if (product.basePrice.presentmentAmount !== price.amount) changes['basePrice.presentmentAmount'] = price.amount
            if (product.quoteOnly !== price.quoteOnly) changes.quoteOnly = price.quoteOnly
            filter.basePrice = product.basePrice
            filter.quoteOnly = product.quoteOnly ?? { $exists: false }
            filter.variantTypes = product.variantTypes ?? { $exists: false }
        }
        return {
            slug, filter, changes, files: changes.images ? files : [],
            before: { images: product.images, basePrice: product.basePrice, quoteOnly: product.quoteOnly },
            after: { images: changes.images || product.images, basePrice: price ? { ...product.basePrice, presentmentAmount: price.amount } : product.basePrice, quoteOnly: price ? price.quoteOnly : product.quoteOnly },
        }
    })
}

export async function executePlan(plan, { apply = false, upload, update, log = console.log }) {
    for (const row of plan) {
        const changed = Object.keys(row.changes).length > 0
        log(JSON.stringify({ slug: row.slug, action: changed ? (apply ? 'APPLY' : 'DRY_RUN') : 'UNCHANGED', before: row.before, after: row.after }))
        if (!apply || !changed) continue
        for (const file of row.files) await upload(file)
        const result = await update(row.filter, { $set: { ...row.changes, updatedAt: new Date() } })
        if (result.matchedCount !== 1) throw new Error(`Concurrent product change; stopped: ${row.slug}`)
    }
}

export async function main(args = process.argv.slice(2)) {
    let manifestPath, apply = false
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--manifest' && args[i + 1]) manifestPath = path.resolve(args[++i])
        else if (args[i] === '--apply') apply = true
        else throw new Error('Usage: --manifest <private JSON file> [--apply]')
    }
    if (!manifestPath) throw new Error('Usage: --manifest <private JSON file> [--apply]')
    dotenv.config({ path: ['.env.local', '.env'] })
    const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')))
    const prepared = await prepareImages(manifest, path.dirname(manifestPath))
    const missing = ['MONGODB_URI', ...(prepared.size ? requiredStorage : [])].filter(name => !process.env[name])
    console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', ready: prepared.size, uncertain: manifest.images.filter(row => row.status === 'UNCERTAIN').length, prices: manifest.prices, missingSettings: missing }))
    if (!process.env.MONGODB_URI || (apply && missing.length)) {
        for (const [slug, files] of prepared) console.log(JSON.stringify({ slug, proposedImages: files.map(file => file.key), before: 'UNVERIFIED: no database read' }))
        console.log('BLOCKED: supply missing settings; no writes performed.')
        process.exitCode = 2
        return
    }
    const mongoose = (await import('mongoose')).default
    let connection, s3
    try {
        // Raw collection access avoids model initialization, index creation and hooks.
        connection = await mongoose.createConnection(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 8000 }).asPromise()
        const products = connection.db.collection('products')
        const slugs = [...new Set([...prepared.keys(), ...manifest.prices.map(row => row.slug)])]
        const docs = await products.find({ slug: { $in: slugs } }, { projection: { slug: 1, images: 1, basePrice: 1, quoteOnly: 1, variantTypes: 1, stripePriceId: 1, stripePriceIds: 1 } }).toArray()
        const plan = planChanges(manifest, docs, prepared) // Complete preflight before any write.
        let upload
        if (apply && prepared.size) {
            const { S3Client, PutObjectCommand, HeadObjectCommand } = await import('@aws-sdk/client-s3')
            s3 = new S3Client({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}) } })
            upload = async file => {
                const target = { Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME, Key: file.key }
                try {
                    const existing = await s3.send(new HeadObjectCommand(target))
                    if (existing.Metadata?.sha256 !== file.digest) throw new Error('Storage key conflict')
                    return
                } catch (error) { if (error.$metadata?.httpStatusCode !== 404) throw error }
                await s3.send(new PutObjectCommand({ ...target, Body: file.body, ContentType: file.contentType, CacheControl: 'public, max-age=31536000', Metadata: { sha256: file.digest }, IfNoneMatch: '*' }))
            }
        }
        await executePlan(plan, { apply, upload, update: (filter, update) => products.updateOne(filter, update) })
        if (apply) {
            const after = await products.find({ slug: { $in: slugs } }, { projection: { slug: 1, images: 1, basePrice: 1, quoteOnly: 1, variantTypes: 1 } }).toArray()
            if (planChanges(manifest, after, prepared).some(row => Object.keys(row.changes).length)) throw new Error('Post-apply verification failed')
            console.log('VERIFIED: all planned values read back; a repeat run is unchanged.')
        }
    } finally { s3?.destroy(); await connection?.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => {
        // Never print connection strings, request objects or SDK credential details.
        const safe = /^(Invalid|Incomplete|Unapproved|Unsupported|Image checksum|Expected|Image changed|Variant price|Stripe price|Concurrent product|Storage key|Post-apply|Usage:)/.test(error.message)
        console.error(safe ? error.message : `Operation failed (${error.name}); check local settings and connectivity. Any completed writes are resumable with the same manifest.`)
        process.exitCode = 1
    })
}
