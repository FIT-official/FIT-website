import { describe, it, expect } from 'vitest'
import { extractTextFromTiptap } from '@/lib/blog/tiptapText'
import { readingTimeMinutes } from '@/lib/blog/readingTime'
import { pickRelated } from '@/lib/blog/related'
import { buildRssXml } from '@/lib/blog/rss'
import { renderTiptapHtml } from '@/lib/blog/renderTiptap'

const tiptapDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Hello' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'World of printing.' }] },
    { type: 'image', attrs: { src: 'https://x/img.png', alt: 'pic' } },
  ],
}

describe('extractTextFromTiptap', () => {
  it('walks nested nodes and joins text', () => {
    expect(extractTextFromTiptap(tiptapDoc)).toBe('Hello World of printing.')
  })
  it('handles null/empty', () => {
    expect(extractTextFromTiptap(null)).toBe('')
    expect(extractTextFromTiptap({})).toBe('')
  })
  it('counts the current HTML body without stylesheet or script text', () => {
    expect(extractTextFromTiptap({ type: 'doc', content: [
      { type: 'htmlBlock', attrs: { html: '<style>p{color:red}</style><h2>Workshop</h2><p>Build a circuit.</p><script>ignored()</script>' } },
    ] })).toBe('Workshop Build a circuit.')
  })
})

describe('readingTimeMinutes', () => {
  it('is at least 1 minute for any non-empty content', () => {
    expect(readingTimeMinutes('short text')).toBe(1)
  })
  it('scales with word count (200 wpm)', () => {
    const words = Array(600).fill('word').join(' ')
    expect(readingTimeMinutes(words)).toBe(3)
  })
  it('returns 0 for empty', () => {
    expect(readingTimeMinutes('')).toBe(0)
    expect(readingTimeMinutes(null)).toBe(0)
  })
  it('strips markdown syntax rather than counting it', () => {
    expect(readingTimeMinutes('# Title\n\n**bold** [link](https://x)')).toBe(1)
  })
})

describe('pickRelated', () => {
  const posts = [
    { slug: 'a', categories: ['printing'], publishDate: '2026-01-04' },
    { slug: 'b', categories: ['printing'], publishDate: '2026-01-03' },
    { slug: 'c', categories: ['news'], publishDate: '2026-01-05' },
    { slug: 'd', categories: [], publishDate: '2026-01-02' },
    { slug: 'me', categories: ['printing'], publishDate: '2026-01-01' },
  ]
  it('prefers same-category, newest first, excludes self, pads with recent, max 3', () => {
    const related = pickRelated(posts.find((p) => p.slug === 'me'), posts, 3)
    expect(related.map((p) => p.slug)).toEqual(['a', 'b', 'c'])
  })
  it('handles a post with no categories', () => {
    const related = pickRelated(posts.find((p) => p.slug === 'd'), posts, 3)
    expect(related).toHaveLength(3)
    expect(related.map((p) => p.slug)).not.toContain('d')
  })
  it('handles empty pool', () => {
    expect(pickRelated(posts[0], [], 3)).toEqual([])
  })
})

describe('buildRssXml', () => {
  it('escapes XML entities and includes items', () => {
    const xml = buildRssXml({
      title: 'Blog & News',
      siteUrl: 'https://fixitoday.com',
      description: 'Stories <tags>',
      posts: [
        {
          title: 'Post & <script>',
          slug: 'post-1',
          excerpt: 'An "excerpt"',
          publishDate: new Date('2026-01-01T00:00:00Z'),
        },
      ],
    })
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).toContain('Blog &amp; News')
    expect(xml).toContain('Post &amp; &lt;script&gt;')
    expect(xml).toContain('https://fixitoday.com/blog/post-1')
    expect(xml).toContain('<pubDate>')
    expect(xml).not.toContain('<script>')
  })
})

describe('renderTiptapHtml', () => {
  it('renders headings, paragraphs and images', () => {
    const html = renderTiptapHtml(tiptapDoc)
    expect(html).toContain('<h2>Hello</h2>')
    expect(html).toContain('World of printing.')
    expect(html).toContain('<img')
    expect(html).toContain('src="https://x/img.png"')
  })
  it('returns empty string for missing doc', () => {
    expect(renderTiptapHtml(null)).toBe('')
  })
  it('does not execute-style-inject through text', () => {
    const html = renderTiptapHtml({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '<img onerror=alert(1)>' }] }],
    })
    expect(html).toContain('&lt;img')
  })
})
