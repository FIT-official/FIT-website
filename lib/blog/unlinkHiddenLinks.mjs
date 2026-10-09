import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'

const parser = unified().use(remarkParse).use(remarkGfm)

export function internalBlogSlug(href) {
    if (typeof href !== 'string' || !href.trim() || href.trim().startsWith('#')) return null
    try {
        const url = new URL(href, 'https://www.fixitoday.com')
        if (!['http:', 'https:'].includes(url.protocol) || !['fixitoday.com', 'www.fixitoday.com'].includes(url.hostname)) return null
        const match = url.pathname.match(/^\/blog\/([^/]+)\/?$/)
        return match && match[1] !== 'feed.xml' ? decodeURIComponent(match[1]) : null
    } catch { return null }
}

const replaceRanges = (source, edits) => edits.sort((a, b) => b.start - a.start)
    .reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source)
const decodeAttribute = value => value.replace(/&#(x[\da-f]+|\d+);?/gi, (all, code) => {
    const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all
}).replace(/&(?:amp|quot|apos|sol|colon);/gi, entity => ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&sol;': '/', '&colon;': ':' }[entity.toLowerCase()]))

// Remove only anchor tags, keeping their text/formatting and all surrounding
// bytes. Skip comments and code/raw-text elements so examples stay examples.
export function unlinkHtmlLinks(source, shouldUnlink, ignoredRanges = []) {
    const edits = [], removed = [], stack = []
    const tokens = /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|pre|code)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>|<\/?a\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi
    for (const token of source.matchAll(tokens)) {
        if (ignoredRanges.some(([start, end]) => token.index >= start && token.index < end)) continue
        const tag = token[0]
        if (/^<a\b/i.test(tag)) {
            const href = tag.match(/\s+href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
            const slug = internalBlogSlug(decodeAttribute(href?.[1] ?? href?.[2] ?? href?.[3] ?? ''))
            stack.push({ start: token.index, end: token.index + tag.length, slug, remove: slug && shouldUnlink(slug) })
        } else if (/^<\/a\b/i.test(tag)) {
            const opening = stack.pop()
            if (opening?.remove) {
                edits.push({ ...opening, text: '' }, { start: token.index, end: token.index + tag.length, text: '' })
                removed.push(opening.slug)
            }
        }
    }
    return { value: replaceRanges(source, edits), removed }
}

export function unlinkMarkdownLinks(source, shouldUnlink) {
    const tree = parser.parse(source), definitions = new Map(), edits = [], removed = []
    const visit = (node, fn) => { fn(node); node.children?.forEach(child => visit(child, fn)) }
    visit(tree, node => { if (node.type === 'definition' && !definitions.has(node.identifier)) definitions.set(node.identifier, node.url) })
    visit(tree, node => {
        if (!['link', 'linkReference'].includes(node.type)) return
        const slug = internalBlogSlug(node.url || definitions.get(node.identifier))
        if (!slug || !shouldUnlink(slug)) return
        const children = node.children || []
        const text = children.length ? source.slice(children[0].position.start.offset, children.at(-1).position.end.offset) : ''
        edits.push({ start: node.position.start.offset, end: node.position.end.offset, text })
        removed.push(slug)
    })
    const markdown = replaceRanges(source, edits), ignored = []
    visit(parser.parse(markdown), node => {
        if (['code', 'inlineCode'].includes(node.type)) ignored.push([node.position.start.offset, node.position.end.offset])
    })
    const html = unlinkHtmlLinks(markdown, shouldUnlink, ignored)
    return { value: html.value, removed: [...removed, ...html.removed] }
}

export function unlinkPostBody(post, shouldUnlink) {
    const patch = {}, changes = []
    if (typeof post.content === 'string') {
        const result = unlinkMarkdownLinks(post.content, shouldUnlink)
        if (result.value !== post.content) patch.content = result.value
        changes.push(...result.removed.map(target => ({ field: 'content', target })))
    }
    if (post.contentJson && typeof post.contentJson === 'object') {
        const walk = node => {
            if (!node || typeof node !== 'object') return node
            if (Array.isArray(node)) return node.map(walk)
            const result = { ...node }
            if (Array.isArray(node.marks)) result.marks = node.marks.filter(mark => {
                const slug = mark.type === 'link' && internalBlogSlug(mark.attrs?.href)
                if (!slug || !shouldUnlink(slug)) return true
                changes.push({ field: 'contentJson', target: slug })
                return false
            }).map(walk)
            if (node.type === 'htmlBlock' && typeof node.attrs?.html === 'string') {
                const html = unlinkHtmlLinks(node.attrs.html, shouldUnlink)
                result.attrs = { ...node.attrs, html: html.value }
                changes.push(...html.removed.map(target => ({ field: 'contentJson', target })))
            }
            if (node.content) result.content = walk(node.content)
            return result
        }
        const value = walk(post.contentJson)
        if (JSON.stringify(value) !== JSON.stringify(post.contentJson)) patch.contentJson = value
    }
    return { patch, changes }
}
