import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import LibraryPage, { metadata } from '../../app/classes/simulations/page'
import ActivityPage, { generateMetadata, generateStaticParams } from '../../app/classes/simulations/[slug]/page'
import { simsRegistry } from '../../content/sims/registry'

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('@/components/ClassroomSimulations/Library', () => ({ default: () => <main>Simulation library</main> }))
vi.mock('@/components/ClassroomSimulations/Activity', () => ({ default: ({ activity }) => <main>{activity.title} — {activity.level}</main> }))
afterEach(cleanup)

describe('Simulation page routes', () => {
  it('renders the existing library route with a canonical URL', () => {
    render(<LibraryPage />)
    expect(screen.getByRole('main')).toHaveTextContent('Simulation library')
    expect(metadata.alternates.canonical).toBe('/classes/simulations')
  })
  it('renders each live detail route and its metadata from the same registry', async () => {
    expect(generateStaticParams()).toHaveLength(8)
    for (const { slug } of generateStaticParams()) {
      const detail = await generateMetadata({ params: Promise.resolve({ slug }) })
      expect(detail.alternates.canonical).toBe(`/classes/simulations/${slug}`)
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
