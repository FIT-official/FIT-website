// @vitest-environment node
import { expect, it, vi } from 'vitest'
import occurrences from '../fixtures/hiddenBlogLinks.json'
import { internalBlogSlug, unlinkPostBody } from '@/lib/blog/unlinkHiddenLinks.mjs'
import { applyMode, main, unlinkPublishedPosts } from '../../scripts/blog/unlink-hidden-post-links.mjs'

const database = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn(), find: vi.fn(() => ({ toArray: async () => [] })) }))
vi.mock('mongoose', () => ({ default: { connect: database.connect, disconnect: database.disconnect } }))
vi.mock('@/models/BlogPost.js', () => ({ default: { collection: { find: database.find } } }))

const hidden = new Set(occurrences.map(item => item.target))
const unlink = post => unlinkPostBody(post, slug => hidden.has(slug))
const target = occurrences[0].target

it.each(occurrences)('unlinks $source -> $target in Markdown, HTML and TipTap while preserving anchor text', ({ source, target }) => {
    const post = { slug: source, content: `Before [Read **the guide**](/blog/${target}?from=post#setup) after.\n<a class="button" href="https://fixitoday.com/blog/${target}/"><em>Read more</em></a>`,
        contentJson: { type: 'doc', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Read the guide', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: `/blog/${target}` } }] }] },
            { type: 'htmlBlock', attrs: { html: `<section><a href='/blog/${target}'>Instructions</a></section>` } },
        ] } }
    const original = structuredClone(post)
    const { patch, changes } = unlink(post)
    expect(patch.content).toBe('Before Read **the guide** after.\n<em>Read more</em>')
    expect(patch.contentJson.content[0].content[0]).toEqual({ type: 'text', text: 'Read the guide', marks: [{ type: 'bold' }] })
    expect(patch.contentJson.content[1].attrs.html).toBe('<section>Instructions</section>')
    expect(changes).toHaveLength(4)
    expect(post).toEqual(original)
    expect(unlink({ ...post, ...patch })).toEqual({ patch: {}, changes: [] })
})
it('exports exactly the eleven known source-target pairs', () => {
    expect(occurrences).toHaveLength(11)
    expect(new Set(occurrences.map(item => `${item.source}:${item.target}`)).size).toBe(11)
})
it('handles reference links, encoded slugs, multiline and unquoted HTML attributes', () => {
    const content = `[Setup][guide]\n\n[guide]: /blog/${target}\n\n<a\n title="x > y" href=/blog/${target}>Go</a>\n<a href="&#47;blog&#47;${target}">Encoded</a>`
    const { patch } = unlink({ content })
    expect(patch.content).toBe(`Setup\n\n[guide]: /blog/${target}\n\nGo\nEncoded`)
    expect(internalBlogSlug('/blog/%69nstall-arduino-ide-windows-macos')).toBe(target)
})
it('preserves published, missing, external and non-blog links, image references and code examples', () => {
    const content = `[Public](/blog/public) [Missing](/blog/absent) [External](https://example.com/blog/${target}) [Shop](/shop) ![Image](/blog/${target})\n\n\`[Code](/blog/${target})\`\n\n\`<a href="/blog/${target}">Code</a>\`\n\n~~~html\n<a href="/blog/${target}">Code</a>\n~~~\n\n<!-- <a href="/blog/${target}">Comment</a> -->\n<pre><a href="/blog/${target}">Example</a></pre>`
    expect(unlink({ content })).toEqual({ patch: {}, changes: [] })
})
it.each(['https://fixitoday.com.evil.example/blog/hidden', 'javascript:/blog/hidden', '#/blog/hidden', '/blog/feed.xml', '/blog/x/more', '/blog/%zz'])('ignores non-article or invalid URL %s', href => {
    expect(internalBlogSlug(href)).toBeNull()
})

function store() {
    const docs = [
        { _id: 'public', slug: 'public', published: true, content: `[Hidden](/blog/${target}) [Unlisted](/blog/unlisted) [Missing](/blog/missing) [Live](/blog/live)` },
        { _id: 'hidden', slug: target, status: 'hidden', published: true, content: `[Do not edit](/blog/unlisted)` },
        { _id: 'unlisted', slug: 'unlisted', status: 'unlisted' },
        { _id: 'live', slug: 'live', status: 'published', published: false },
    ]
    return { docs, find: vi.fn(() => ({ toArray: async () => docs })), updateOne: vi.fn(async (filter, update) => {
        Object.assign(docs.find(doc => doc._id === filter._id), update.$set)
        return { matchedCount: 1 }
    }) }
}
it('defaults to dry run; environment consent alone cannot enable writes', async () => {
    expect(applyMode([], {})).toBe(false)
    expect(applyMode([], { CONFIRM_BLOG_UNLINK: 'yes' })).toBe(false)
    expect(applyMode(['--dry-run'], { CONFIRM_BLOG_UNLINK: 'yes' })).toBe(false)
    expect(() => applyMode(['--apply'], {})).toThrow('AND')
    expect(() => applyMode(['--apply'], { CONFIRM_BLOG_UNLINK: 'true' })).toThrow('AND')
    expect(() => applyMode(['--apply', '--dry-run'], { CONFIRM_BLOG_UNLINK: 'yes' })).toThrow('one mode')
    expect(() => applyMode(['--unknown'], {})).toThrow('Use')
    expect(applyMode(['--apply'], { CONFIRM_BLOG_UNLINK: 'yes' })).toBe(true)
    const collection = store(), log = vi.fn()
    expect(await unlinkPublishedPosts(collection, { log })).toEqual({ mode: 'DRY RUN', changedPosts: 1, removedLinks: 2 })
    expect(collection.updateOne).not.toHaveBeenCalled()
    expect(log.mock.calls[0][0]).toContain('beforeBytes')
})
it('writes only changed published bodies, keeps visibility and is idempotent (mock database)', async () => {
    const collection = store(), log = vi.fn()
    await unlinkPublishedPosts(collection, { apply: true, log })
    expect(collection.updateOne).toHaveBeenCalledTimes(1)
    const [filter, update] = collection.updateOne.mock.calls[0]
    expect(filter).toMatchObject({ _id: 'public', content: expect.stringContaining('[Hidden]'), $or: expect.any(Array) })
    expect(Object.keys(update.$set).sort()).toEqual(['content', 'updatedAt'])
    expect(collection.docs[0].content).toBe('Hidden Unlisted [Missing](/blog/missing) [Live](/blog/live)')
    expect(collection.docs[1].content).toContain('[Do not edit]')
    expect(await unlinkPublishedPosts(collection, { apply: true, log })).toEqual({ mode: 'APPLY', changedPosts: 0, removedLinks: 0 })
    expect(collection.updateOne).toHaveBeenCalledTimes(1)
})
it('stops when a concurrent change prevents a compare-and-set update', async () => {
    const collection = store()
    collection.updateOne.mockResolvedValue({ matchedCount: 0 })
    await expect(unlinkPublishedPosts(collection, { apply: true, log: vi.fn() })).rejects.toThrow('changed during the audit')
})
it('disables automatic collection/index writes and closes the mocked connection', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
        await main([], { MONGODB_URI: 'mocked-connection' })
        expect(database.connect).toHaveBeenCalledWith('mocked-connection', expect.objectContaining({ autoCreate: false, autoIndex: false }))
        expect(database.disconnect).toHaveBeenCalledTimes(1)
        database.connect.mockRejectedValueOnce(Error('offline'))
        await expect(main([], { MONGODB_URI: 'mocked-connection' })).rejects.toThrow('offline')
        expect(database.disconnect).toHaveBeenCalledTimes(2)
    } finally { log.mockRestore() }
})
