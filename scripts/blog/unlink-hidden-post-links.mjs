// No dotenv loading. The operator supplies a connection through the process
// environment; default execution only reads. Never print credentials or bodies.
import { pathToFileURL } from 'node:url'
import { effectiveStatus, statusQuery } from '../../lib/blog/status.js'
import { unlinkPostBody } from '../../lib/blog/unlinkHiddenLinks.mjs'

export function applyMode(args, env) {
    if (args.some(arg => !['--apply', '--dry-run'].includes(arg))) throw Error('Use --dry-run (default), or --apply with CONFIRM_BLOG_UNLINK=yes.')
    if (args.includes('--apply') && args.includes('--dry-run')) throw Error('Choose one mode.')
    if (args.includes('--apply') && env.CONFIRM_BLOG_UNLINK !== 'yes') throw Error('Writes require --apply AND CONFIRM_BLOG_UNLINK=yes.')
    return args.includes('--apply') && env.CONFIRM_BLOG_UNLINK === 'yes'
}

export async function unlinkPublishedPosts(collection, { apply = false, log = console.log } = {}) {
    const posts = await collection.find({}, { projection: { slug: 1, status: 1, published: 1, content: 1, contentJson: 1, updatedAt: 1 } }).toArray()
    const hidden = new Set(posts.filter(post => effectiveStatus(post) !== 'published').map(post => post.slug))
    // A published target always wins if legacy data contains duplicate slugs.
    for (const post of posts) if (effectiveStatus(post) === 'published') hidden.delete(post.slug)
    let changedPosts = 0, removedLinks = 0
    for (const post of posts) {
        if (effectiveStatus(post) !== 'published') continue
        const { patch, changes } = unlinkPostBody(post, slug => hidden.has(slug))
        if (!Object.keys(patch).length) continue
        log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY RUN', source: post.slug, changes,
            diff: Object.entries(patch).map(([field, value]) => ({ field, beforeBytes: Buffer.byteLength(JSON.stringify(post[field])), afterBytes: Buffer.byteLength(JSON.stringify(value)) })) }))
        if (apply) {
            // Compare both original bodies and visibility; never overwrite a
            // concurrent edit or change a post's publication status.
            const original = Object.fromEntries(Object.keys(patch).map(field => [field, post[field]]))
            const result = await collection.updateOne({ _id: post._id, ...statusQuery('published'), ...original, updatedAt: post.updatedAt ?? null },
                { $set: { ...patch, updatedAt: new Date() } })
            if (result.matchedCount !== 1) throw Error('A post changed during the audit. Rerun the dry run before applying.')
        }
        changedPosts += 1
        removedLinks += changes.length
    }
    const summary = { mode: apply ? 'APPLY' : 'DRY RUN', changedPosts, removedLinks }
    log(JSON.stringify(summary))
    return summary
}

export async function main(args = process.argv.slice(2), env = process.env) {
    const apply = applyMode(args, env)
    if (!env.MONGODB_URI) throw Error('Supply MONGODB_URI in the process environment. No env files are loaded.')
    const { default: mongoose } = await import('mongoose')
    try {
        // Compiling a Mongoose model must not create collections or indexes in
        // dry-run mode. Only the explicit compare-and-set below may write.
        await mongoose.connect(env.MONGODB_URI, { maxPoolSize: 2, serverSelectionTimeoutMS: 10000, autoCreate: false, autoIndex: false })
        const { default: BlogPost } = await import('../../models/BlogPost.js')
        return await unlinkPublishedPosts(BlogPost.collection, { apply })
    } finally { await mongoose.disconnect() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(() => { console.error('Blog link cleanup failed. Check the mode, connection and concurrent edits; credentials and content are omitted.'); process.exitCode = 1 })
}
