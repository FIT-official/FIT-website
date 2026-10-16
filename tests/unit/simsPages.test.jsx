import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import LibraryPage, { metadata, dynamic as libraryDynamic } from '../../app/class/simulations/page'
import ActivityPage, { generateMetadata, generateStaticParams, dynamic as activityDynamic } from '../../app/class/simulations/[slug]/page'
import { simsRegistry } from '../../content/sims/registry'
// Original-activity contract: concept-family variants are switched on separately (see tests/simFamilies/live.test.js).
vi.mock('../../public/simulations/families/live.js', () => ({ LIVE_FAMILY: [] }))
vi.mock('../../content/sims/htmlSims.js', () => ({ htmlSims: [] }))

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('@/components/ClassroomSimulations/Library', () => ({ default: ({ addToClassEnabled }) => <main data-add-to-class={String(addToClassEnabled)}>Simulation library</main> }))
vi.mock('@/components/ClassroomSimulations/Activity', () => ({ default: ({ activity, addToClassEnabled }) => <main data-add-to-class={String(addToClassEnabled)}>{activity.title} — {activity.level}</main> }))
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

describe('Simulation page routes', () => {
  it('renders the existing library route with a canonical URL', () => {
    render(<LibraryPage />)
    expect(screen.getByRole('main')).toHaveTextContent('Simulation library')
    expect(metadata.alternates.canonical).toBe('/class/simulations')
  })
  it.each([undefined, '', '0', 'true', '01', '1 '])('keeps assignment disabled on both routes for SIMS_ADD_TO_CLASS=%s', async value => {
    vi.stubEnv('SIMS_ADD_TO_CLASS', value)
    const { unmount } = render(<LibraryPage />)
    expect(screen.getByRole('main')).toHaveAttribute('data-add-to-class', 'false')
    unmount()
    render(await ActivityPage({ params: Promise.resolve({ slug: 'sampling' }) }))
    expect(screen.getByRole('main')).toHaveAttribute('data-add-to-class', 'false')
  })
  it('passes the enabled server flag to both routes without static output caching', async () => {
    vi.stubEnv('SIMS_ADD_TO_CLASS', '1')
    const { unmount } = render(<LibraryPage />)
    expect(screen.getByRole('main')).toHaveAttribute('data-add-to-class', 'true')
    unmount()
    render(await ActivityPage({ params: Promise.resolve({ slug: 'sampling' }) }))
    expect(screen.getByRole('main')).toHaveAttribute('data-add-to-class', 'true')
    expect(libraryDynamic).toBe('force-dynamic')
    expect(activityDynamic).toBe('force-dynamic')
  })
  it('renders each live detail route and its metadata from the same registry', async () => {
    expect(generateStaticParams()).toHaveLength(8)
    for (const { slug } of generateStaticParams()) {
      const detail = await generateMetadata({ params: Promise.resolve({ slug }) })
      expect(detail.alternates.canonical).toBe(`/class/simulations/${slug}`)
      expect(detail.title).toContain(simsRegistry.find(sim => sim.id === slug).title)
    }
    render(await ActivityPage({ params: Promise.resolve({ slug: 'sampling' }) }))
    expect(screen.getByRole('main')).toHaveTextContent('Signal Sampling Detective — JC')
  })
  it('excludes drafts from static params, metadata and detail pages', async () => {
    const previous = simsRegistry[0].status
    try {
      simsRegistry[0].status = 'draft'
      expect(generateStaticParams()).not.toContainEqual({ slug: 'sampling' })
      expect(await generateMetadata({ params: Promise.resolve({ slug: 'sampling' }) })).toEqual({ title: 'Activity not found | FIT' })
      await expect(ActivityPage({ params: Promise.resolve({ slug: 'sampling' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    } finally { simsRegistry[0].status = previous }
    await expect(ActivityPage({ params: Promise.resolve({ slug: 'unknown' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
