import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { renderPublicMarkdown } from '@/lib/seo/publicContent'
import { readingTimeMinutes } from './readingTime'

const directory = path.join(process.cwd(), 'content', 'blog-drafts')
const validSlug = slug => typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)

export function cleanDraftBody(body) {
    return String(body || '')
        .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
        .replace(/^.*NOT ChatGPT-drafted[^\r\n]*(?:\r?\n|$)/gmi, '')
        .trim()
}

export function parseDraft(source, slug) {
    if (!validSlug(slug)) return null
    const { data, content } = matter(source)
    if (data.slug !== slug || data.status !== 'draft') return null
    for (const field of ['title', 'excerpt', 'date', 'author', 'coverImage']) {
        if (typeof data[field] !== 'string' || !data[field].trim()) return null
    }
    if (!new RegExp(`^/blog-drafts/${slug}\\.(?:jpg|jpeg|png|webp)$`).test(data.coverImage)) return null
    const body = cleanDraftBody(content)
    // The page owns the H1; remove only an identical opening Markdown title.
    const lines = body.split(/\r?\n/)
    if (lines[0] === `# ${data.title}`) lines.shift()
    // An explicit projection prevents frontmatter/editorial notes or raw source
    // from reaching React props, metadata, HTML, or the RSC response.
    return {
        title: data.title,
        slug,
        excerpt: data.excerpt,
        tags: Array.isArray(data.tags) ? data.tags.filter(tag => typeof tag === 'string') : [],
        coverImage: data.coverImage,
        date: data.date,
        author: data.author,
        status: 'draft',
        readingTimeMinutes: readingTimeMinutes(body.replace(/```[\s\S]*?```/g, '')),
        // Existing Remark renderer supports GFM tables/fences, drops raw HTML,
        // and rejects unsafe link protocols before HTML serialization.
        contentHtml: renderPublicMarkdown(lines.join('\n')),
    }
}

export function getDraft(slug) {
    if (!validSlug(slug)) return null
    try {
        // These small repo files are read synchronously so Next development
        // promise diagnostics cannot serialize raw frontmatter into RSC HTML.
        return parseDraft(readFileSync(path.join(directory, `${slug}.md`), 'utf8'), slug)
    } catch (error) {
        if (error.code === 'ENOENT') return null
        throw error
    }
}

export function getDrafts() {
    const files = readdirSync(directory).filter(file => file.endsWith('.md')).sort()
    const drafts = files.map(file => getDraft(file.slice(0, -3)))
    return drafts.filter(Boolean).map(draft => {
        const { contentHtml, ...summary } = draft
        return summary
    })
}
