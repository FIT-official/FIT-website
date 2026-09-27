// Convert every legacy post (contentFormat other than 'tiptap') onto the
// modern TipTap format: raw-HTML content becomes one byte-preserving
// htmlBlock node; markdown content becomes real TipTap nodes (via
// lib/blog/normalizeContent). The original `content` string is left
// untouched as a backup, so the change is reversible.
//
// Usage:
//   node scripts/convert-legacy-html-posts.mjs           # dry run (default)
//   node scripts/convert-legacy-html-posts.mjs --apply   # write changes
//
// Reads MONGODB_URI from the environment or .env in the repo root.

import { readFileSync } from 'node:fs'
import mongoose from 'mongoose'
import { normalizeToTiptap } from '../lib/blog/normalizeContent.js'

const apply = process.argv.includes('--apply')

function mongoUri() {
    if (process.env.MONGODB_URI) return process.env.MONGODB_URI
    try {
        const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
        const line = env.split('\n').find((l) => l.startsWith('MONGODB_URI='))
        if (line) return line.slice('MONGODB_URI='.length).trim().replace(/^['"]|['"]$/g, '')
    } catch { /* fall through */ }
    throw new Error('MONGODB_URI not set and .env not readable')
}

async function main() {
    const conn = await mongoose.connect(mongoUri(), { maxPoolSize: 5, minPoolSize: 0, maxIdleTimeMS: 60000 })
    const col = conn.connection.db.collection('blogposts')

    // Targets: anything still legacy-formatted, plus earlier conversions that
    // became ONE giant htmlBlock (pre-segmentation) — those re-normalize from the
    // preserved `content` backup into the segmented doc.
    const isSingleHtmlBlock = (doc) =>
        Array.isArray(doc?.content) && doc.content.length === 1 && doc.content[0]?.type === 'htmlBlock'

    const all = await col
        .find(
            {
                $or: [
                    { contentFormat: { $ne: 'tiptap' } },
                    { contentFormat: 'tiptap', 'contentJson.content.0.type': 'htmlBlock', content: { $regex: /^\s*</ } },
                ],
            },
            { projection: { title: 1, slug: 1, content: 1, contentFormat: 1, contentJson: 1 } },
        )
        .toArray()
    const candidates = all.filter(
        (p) => p.contentFormat !== 'tiptap' || isSingleHtmlBlock(p.contentJson),
    )

    console.log(`${candidates.length} post(s) to normalize${apply ? '' : ' (dry run, pass --apply to write)'}`)

    let converted = 0
    for (const post of candidates) {
        const size = Buffer.byteLength(post.content || '', 'utf8')
        const kind = String(post.content || '').trimStart().startsWith('<') ? 'html' : 'markdown'
        console.log(`- ${post.slug} | ${kind} | ${String(post.title).slice(0, 60)} | ${(size / 1024).toFixed(0)}KB`)
        if (!apply) continue
        // Force re-normalization from the raw source, not the existing doc.
        const normalized = normalizeToTiptap({ contentFormat: 'legacy', content: post.content })
        await col.updateOne(
            { _id: post._id },
            {
                $set: {
                    contentFormat: 'tiptap',
                    contentJson: normalized.contentJson,
                    // `content` intentionally untouched: reversible backup.
                },
            },
        )
        converted += 1
    }

    console.log(apply ? `Converted ${converted} post(s).` : 'No changes written.')
}

await main().finally(() => mongoose.disconnect())
