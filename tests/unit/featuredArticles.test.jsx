// Home-page featured articles: lean /api/blog fetch, featured-first selection,
// and overflow safety (clamped text, min-w-0 flex children, object-cover media).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import FeaturedArticles from '@/components/Home/FeaturedArticles'

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt, className }) => <img src={typeof src === 'string' ? src : ''} alt={alt} className={className} />,
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a>,
}))

const LONG_TITLE = 'An extremely long imported article title that keeps going and going and would normally push the card sideways off the viewport on a 375px phone screen'
const LONG_EXCERPT = 'A very long excerpt. '.repeat(40)

const posts = [
  { _id: 'p1', title: LONG_TITLE, slug: 'long-one', excerpt: LONG_EXCERPT, heroImage: 'blog/hero1.jpg', featured: true, publishDate: '2026-05-01T00:00:00Z', readingTimeMinutes: 7 },
  { _id: 'p2', title: 'Second post', slug: 'second', excerpt: 'Short.', featured: false, publishDate: '2026-06-01T00:00:00Z' },
  { _id: 'p3', title: 'Third post', slug: 'third', excerpt: 'Short.', featured: false, publishDate: '2026-04-01T00:00:00Z' },
  { _id: 'p4', title: 'Fourth post', slug: 'fourth', excerpt: 'Short.', featured: false, publishDate: '2026-03-01T00:00:00Z' },
]

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, posts }) }))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('FeaturedArticles', () => {
  it('fetches the lean public list and shows featured posts first, capped', async () => {
    render(<FeaturedArticles />)
    expect(await screen.findByText(LONG_TITLE)).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith('/api/blog')
    // featured first, then most recent; capped at 3 so the section can't sprawl
    expect(screen.getByText('Second post')).toBeInTheDocument()
    expect(screen.getByText('Third post')).toBeInTheDocument()
    expect(screen.queryByText('Fourth post')).toBeNull()
  })

  it('clamps long titles and excerpts and keeps flex children shrinkable', async () => {
    render(<FeaturedArticles />)
    const title = await screen.findByText(LONG_TITLE)
    expect(title.className).toContain('line-clamp-2')
    expect(title.className).toContain('break-words')

    const excerpt = screen.getByText((t) => t.startsWith('A very long excerpt.'))
    expect(excerpt.className).toContain('line-clamp-3')

    // every card link is an equal-height column that is allowed to shrink
    const card = title.closest('a')
    expect(card).toHaveAttribute('href', '/blog/long-one')
    expect(card.className).toContain('min-w-0')
    expect(card.className).toContain('h-full')
    expect(card.className).toContain('border-borderColor')
    expect(card.className).toContain('rounded-md')
  })

  it('renders images object-cover inside a fixed aspect box', async () => {
    render(<FeaturedArticles />)
    const img = (await screen.findAllByRole('img'))[0]
    expect(img.className).toContain('object-cover')
    expect(img.parentElement.className).toContain('aspect-[16/10]')
  })

  it('marks only the newest post with the New tag', async () => {
    render(<FeaturedArticles />)
    await screen.findByText(LONG_TITLE)
    const tags = screen.getAllByText('New')
    expect(tags).toHaveLength(1)
    expect(tags[0].closest('a')).toHaveAttribute('href', '/blog/second')
  })

  it('renders nothing while loading or when there are no posts', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, posts: [] }) }))
    const { container } = render(<FeaturedArticles />)
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
  })
})

it('uses a section heading with article titles beneath it, not a heading for the eyebrow', async () => {
  render(<FeaturedArticles />)
  await screen.findByText(LONG_TITLE)
  expect(screen.getByRole('heading', { level: 2, name: 'Featured Articles' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'From the Blog' })).toBeNull()
  for (const title of [LONG_TITLE, 'Second post', 'Third post']) {
    expect(screen.getByRole('heading', { level: 3, name: title })).toBeInTheDocument()
  }
})
