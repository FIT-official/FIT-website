import React from 'react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import matter from 'gray-matter'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ dbImport: vi.fn(), connect: vi.fn(), auth: vi.fn(), admin: vi.fn() }))
vi.mock('@/lib/db', () => { mocks.dbImport(); return { connectToDatabase: mocks.connect } })
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: mocks.admin }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_HTTP_ERROR_FALLBACK;404') } }))
vi.mock('next/image', () => ({ default: ({ src, alt }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />,
}))

import { cleanDraftBody, getDraft, getDrafts, parseDraft } from '@/lib/blog/drafts'
import Index, { metadata } from '@/app/blog/drafts/page'
import Page, { generateMetadata } from '@/app/blog/drafts/[slug]/page'
import Layout, { metadata as layoutMetadata } from '@/app/blog/drafts/layout'
import config from '../../next.config.mjs'

const slugs = [
    'pla-vs-petg-vs-marble-wood-pla', 'guide-to-bambu-lab-filament',
    'bulk-filament-for-schools-and-makerspaces', 'repair-or-replace-3d-printer',
    'esp32-starter-project-phone-control', 'behind-the-scenes-at-fix-it-today',
]
const params = slug => ({ params: Promise.resolve({ slug }) })
beforeEach(() => {
    // Preserve the import spy across module initialization and all cases.
    mocks.connect.mockClear()
    mocks.auth.mockReset()
    mocks.admin.mockReset()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('BLOG_DRAFTS_PREVIEW', '')
    mocks.auth.mockResolvedValue({ userId: null })
    mocks.admin.mockResolvedValue(false)
})
afterEach(() => vi.unstubAllEnvs())

describe('file draft visibility', () => {
    it.each([null, 'customer'])('returns notFound for a production non-admin (%s)', async userId => {
        mocks.auth.mockResolvedValue({ userId })
        await expect(Index()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
        await expect(Page(params(slugs[0]))).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
        await expect(generateMetadata(params(slugs[0]))).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
    })
    it('ignores the local opt-in in production', async () => {
        vi.stubEnv('BLOG_DRAFTS_PREVIEW', '1')
        await expect(Index()).rejects.toThrow('404')
    })
    it('allows a verified production admin through the existing privilege check', async () => {
        mocks.auth.mockResolvedValue({ userId: 'admin-user' })
        mocks.admin.mockResolvedValue(true)
        expect(renderToStaticMarkup(await Index())).toContain('Journal drafts')
        expect(renderToStaticMarkup(await Page(params(slugs[0])))).toContain('PLA vs PETG')
        expect(mocks.admin).toHaveBeenCalledWith('admin-user')
    })
    it('fails closed when authentication fails', async () => {
        mocks.auth.mockRejectedValue(new Error('Unavailable'))
        await expect(Index()).rejects.toThrow('404')
    })
    it.each(['preview', 'local'])('renders %s without consulting auth', async mode => {
        if (mode === 'preview') vi.stubEnv('VERCEL_ENV', 'preview')
        else { vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('BLOG_DRAFTS_PREVIEW', '1') }
        const html = renderToStaticMarkup(<Layout>{await Index()}</Layout>)
        expect(html).toContain('DRAFT — not published')
        for (const slug of slugs) expect(html).toContain(`/blog/drafts/${slug}`)
        expect(mocks.auth).not.toHaveBeenCalled()
        expect(mocks.admin).not.toHaveBeenCalled()
    })
    it('requires opt-in in development and returns 404 for an unknown preview slug', async () => {
        vi.stubEnv('NODE_ENV', 'development')
        await expect(Index()).rejects.toThrow('404')
        vi.stubEnv('BLOG_DRAFTS_PREVIEW', '1')
        await expect(Page(params('missing'))).rejects.toThrow('404')
    })
    it('provides noindex metadata and a header covering the index and descendants', async () => {
        vi.stubEnv('VERCEL_ENV', 'preview')
        for (const value of [metadata, layoutMetadata, await generateMetadata(params(slugs[0]))]) {
            expect(value.robots).toEqual({ index: false, follow: false })
        }
        expect(await config.headers()).toContainEqual({ source: '/blog/drafts/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] })
        expect(config.outputFileTracingIncludes).toMatchObject({
            '/blog/drafts': ['./content/blog-drafts/*.md'],
            '/blog/drafts/*': ['./content/blog-drafts/*.md'],
        })
    })
})

describe('file draft content', () => {
    it('loads exactly the six slugs with display fields only, without importing a database', async () => {
        // Raw fs promises are serialized by Next's development diagnostics.
        expect(getDraft(slugs[0])).not.toBeInstanceOf(Promise)
        expect((await getDrafts()).map(draft => draft.slug).sort()).toEqual([...slugs].sort())
        expect(mocks.dbImport).not.toHaveBeenCalled()
        expect(mocks.connect).not.toHaveBeenCalled()
        expect(readFileSync('lib/blog/drafts.js', 'utf8')).not.toMatch(/(?:lib\/db|mongoose|models\/)/)
        for (const summary of await getDrafts()) {
            expect(summary).not.toHaveProperty('adminNote')
            expect(summary).not.toHaveProperty('contentHtml')
        }
    })
    it.each(slugs)('renders %s with no editorial label, removed testimonial, comments or private props', async slug => {
        vi.stubEnv('VERCEL_ENV', 'preview')
        const draft = await getDraft(slug)
        const page = await Page(params(slug))
        const html = renderToStaticMarkup(<Layout>{page}</Layout>)
        for (const value of [html, draft.contentHtml, JSON.stringify(draft), JSON.stringify(page), JSON.stringify(await generateMetadata(params(slug)))]) {
            expect(value).not.toMatch(/ChatGPT|Cedrick|<!--|adminNote|draft_note/)
        }
        expect(html.match(/<h1\b/g)).toHaveLength(1)
        expect(draft.readingTimeMinutes).toBeGreaterThan(0)
        expect(draft.tags.length).toBeGreaterThan(0)
        const { data, content } = matter(readFileSync(`content/blog-drafts/${slug}.md`, 'utf8'))
        expect(data.adminNote).toContain('NOT ChatGPT-drafted, for vetting')
        expect(data.date).toBe('2026-10-10')
        expect(data.author).toBe('Fix It Today')
        expect(data.status).toBe('draft')
        expect(content).not.toMatch(/ChatGPT|Cedrick|<!--/)
        expect(statSync(`public${draft.coverImage}`).size).toBeLessThanOrEqual(400 * 1024)
    })
    it('keeps both ESP32 code blocks, including HTML within the sketch as escaped text', async () => {
        const { contentHtml } = await getDraft(slugs[4])
        const doc = new DOMParser().parseFromString(contentHtml, 'text/html')
        const blocks = doc.querySelectorAll('pre > code')
        expect(blocks).toHaveLength(2)
        expect(blocks[0].className).toBe('language-cpp')
        expect(blocks[0].textContent).toContain('#include')
        expect(blocks[1].className).toBe('language-json')
        expect(JSON.parse(blocks[1].textContent).author).toBe('Fix It Today')
        expect(doc.querySelector('script')).toBeNull()
    })
    it('strips closed and unterminated comments and rejects raw HTML and unsafe URLs', () => {
        const original = readFileSync(`content/blog-drafts/${slugs[0]}.md`, 'utf8')
        const source = `${original}\n<!-- Cedrick -->\n<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n> **NOT ChatGPT-drafted, for vetting.** Draft only — not published.\n<!-- Cedrick`
        const result = parseDraft(source, slugs[0])
        expect(result.contentHtml).not.toMatch(/Cedrick|ChatGPT|<!--|<script|javascript:/)
        expect(cleanDraftBody('Before <!-- removed\ncomment --> after')).toBe('Before  after')
    })
    it.each(['../package', '..\\package', '/absolute', '%2e%2e', 'UPPER', '', null])('rejects non-slug paths: %s', async slug => {
        expect(await getDraft(slug)).toBeNull()
    })
    it('keeps the draft directory separate from the existing MDX content endpoint', () => {
        expect(readdirSync('content/blog-drafts').every(name => name.endsWith('.md'))).toBe(true)
        expect(readFileSync('lib/mdx.js', 'utf8')).toContain('`${contentPath}.mdx`')
    })
})
