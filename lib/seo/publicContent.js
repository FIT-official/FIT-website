import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'

export function contentDescription(value, limit = 160) {
    const text = String(value || '')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+)/gm, '')
        .replace(/[*_`~]/g, '')
        .replace(/&(?:nbsp|amp|quot|apos|lt|gt);/g, entity => ({ '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' })[entity])
        .replace(/\s+/g, ' ').trim()
    return text.length <= limit ? text : `${text.slice(0, limit - 1).replace(/\s+\S*$/, '').trimEnd()}…`
}

// Markdown is rendered without raw HTML. Restrict generated link/image URLs
// before stringifying, including entity-encoded unsafe protocols.
function safeMarkdownUrls() {
    return tree => {
        const walk = node => {
            for (const property of ['href', 'src']) {
                const value = node.properties?.[property]
                if (typeof value !== 'string') continue
                try {
                    const protocol = new URL(value, 'https://www.fixitoday.com').protocol
                    const allowed = property === 'href' ? ['http:', 'https:', 'mailto:', 'tel:'] : ['http:', 'https:']
                    if (!allowed.includes(protocol)) delete node.properties[property]
                } catch { delete node.properties[property] }
            }
            node.children?.forEach(walk)
        }
        walk(tree)
    }
}

const markdown = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(safeMarkdownUrls).use(rehypeStringify)

export function renderPublicMarkdown(source) {
    return String(markdown.processSync(String(source || '')))
}

export function validIsoDate(value) {
    if (!value) return undefined
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}
