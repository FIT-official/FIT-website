// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/models/ContentBlock', () => ({ default: { findOne: vi.fn() } }))
vi.mock('@/lib/mdx', () => ({ getContentByPath: vi.fn() }))

import { connectToDatabase } from '@/lib/db'
import ContentBlock from '@/models/ContentBlock'
import { getContentByPath } from '@/lib/mdx'
import { getHomeHeroContent } from '@/lib/homeHero'

const neutral = { text: '3D printing and modeling services', heroImage: null, darkOverlay: false }
let block, query

beforeEach(() => {
    vi.resetAllMocks()
    block = null
    connectToDatabase.mockResolvedValue({})
    query = { select: vi.fn().mockReturnThis(), lean: vi.fn(async () => block) }
    ContentBlock.findOne.mockReturnValue(query)
    getContentByPath.mockReturnValue({ frontmatter: { text: 'Seed text', heroImage: 'seed/old-image.jpg' } })
})

describe('homepage hero content', () => {
    it('prefers the current database override and returns only serializable presentation fields', async () => {
        block = { _id: 'internal', frontmatter: { text: 'Current services', heroImage: 'admin/uploads/current.jpg',
            darkOverlay: 35, fieldMeta: { internal: true }, updatedAt: new Date() }, content: 'Private draft' }
        const hero = await getHomeHeroContent()
        expect(hero).toEqual({ text: 'Current services', heroImage: 'admin/uploads/current.jpg', darkOverlay: 35 })
        expect(JSON.parse(JSON.stringify(hero))).toEqual(hero)
        expect(ContentBlock.findOne).toHaveBeenCalledWith({ path: 'home/hero-banner' })
        expect(query.select).toHaveBeenCalledWith('frontmatter -_id')
        expect(getContentByPath).not.toHaveBeenCalled()
    })

    it('uses the existing MDX seed only when the database contains no block', async () => {
        expect(await getHomeHeroContent()).toEqual({ text: 'Seed text', heroImage: 'seed/old-image.jpg', darkOverlay: false })
        expect(getContentByPath).toHaveBeenCalledWith('home/hero-banner')
    })

    it.each([{}, { heroImage: null }, { heroImage: '' }, { heroImage: '/placeholder.jpg' },
        { heroImage: ' /placeholder.jpg?cache=1 ' }])('does not restore an old seed image over an existing neutral override %j', async frontmatter => {
        block = { frontmatter }
        expect(await getHomeHeroContent()).toEqual(neutral)
        expect(getContentByPath).not.toHaveBeenCalled()
    })

    it.each(['connection', 'query'])('uses a neutral hero after a database %s failure without reading the seed', async failure => {
        if (failure === 'connection') connectToDatabase.mockRejectedValue(new Error('Database unavailable'))
        else query.lean.mockRejectedValue(new Error('Database unavailable'))
        expect(await getHomeHeroContent()).toEqual(neutral)
        expect(getContentByPath).not.toHaveBeenCalled()
    })

    it('uses a neutral hero when no content exists', async () => {
        getContentByPath.mockReturnValue(null)
        expect(await getHomeHeroContent()).toEqual(neutral)
    })

    it('never uses the cat placeholder from a seed and bounds its overlay', async () => {
        getContentByPath.mockReturnValue({ frontmatter: { heroImage: '/placeholder.jpg', darkOverlay: 200 } })
        expect(await getHomeHeroContent()).toEqual({ ...neutral, darkOverlay: 80 })
    })

    it('preserves explicit empty text and the legacy boolean overlay', async () => {
        block = { frontmatter: { text: '', heroImage: 'https://example.com/current.jpg', darkOverlay: true } }
        expect(await getHomeHeroContent()).toEqual({ text: '', heroImage: 'https://example.com/current.jpg', darkOverlay: true })
    })

    it('reads current content on a later request without caching the previous override', async () => {
        block = { frontmatter: { heroImage: 'old.jpg' } }
        expect((await getHomeHeroContent()).heroImage).toBe('old.jpg')
        block = { frontmatter: { heroImage: 'new.jpg' } }
        expect((await getHomeHeroContent()).heroImage).toBe('new.jpg')
        expect(ContentBlock.findOne).toHaveBeenCalledTimes(2)
    })
})
