import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { siteFacts } from '@/lib/home/siteFacts'
import { BULK_BANDS, BULK_LADDERS, bulkTier, priceBulkLines } from '@/lib/bulkFilamentConfig'
import { HOME_SECTIONS } from '@/lib/home/flags'
import { realImageSrc, selectShopPicks } from '@/lib/home/content'
import { VisitDetails, VisitPickup, LocalBusinessSchema, GoogleRating, Reviews, ClientLogos, WhatsAppButton } from '@/components/Home/v2/FactSections'
import Hero from '@/components/Home/v2/Hero'
import HeroVideo from '@/components/Home/v2/HeroVideo'
import Faq from '@/components/Home/v2/Faq'
import BulkCalculator from '@/components/Home/v2/BulkCalculator'
import HomeContent, { ShopPicks } from '@/components/Home/v2/HomeContent'

vi.mock('next/image', () => ({ default: ({ fill, priority, alt, ...props }) =>
    // eslint-disable-next-line @next/next/no-img-element -- Observe the image preload contract in jsdom.
    <img {...props} alt={alt} data-priority={priority ? 'true' : undefined} />,
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/components/General/SubscribeForm', () => ({ default: () => <form aria-label="Newsletter"><input type="email" aria-label="Email address" /><button>Subscribe</button></form> }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const renderHtml = component => renderToStaticMarkup(component)
const product = (i, image = `/images/filament/bambu/photo-${i}.webp`) => ({ name: `Filament ${i}`, slug: `filament-${i}`, productType: 'shop', images: [image] })

describe('confirmed facts only', () => {
    it.each([VisitDetails, VisitPickup, LocalBusinessSchema, GoogleRating, Reviews, ClientLogos, WhatsAppButton])('%s renders nothing for the pending owner facts', Component => {
        expect(renderHtml(<Component />)).toBe('')
    })
    it('hides the video completely when its fact is null', () => {
        expect(renderHtml(<HeroVideo src={siteFacts.heroVideo} />)).toBe('')
    })
    it('requires address and hours together for LocalBusiness schema', () => {
        const address = { streetAddress: 'Test address', addressCountry: 'SG' }
        const openingHours = ['Mo-Fr 09:00-17:00']
        expect(renderHtml(<LocalBusinessSchema facts={{ address }} />)).toBe('')
        expect(renderHtml(<LocalBusinessSchema facts={{ openingHours }} />)).toBe('')
        const markup = renderHtml(<LocalBusinessSchema facts={{ address, openingHours }} />)
        const schema = JSON.parse(markup.match(/<script[^>]*>(.*?)<\/script>/)[1])
        expect(schema).toMatchObject({ '@type': 'LocalBusiness', address: { '@type': 'PostalAddress', ...address }, openingHours })
        expect(schema).not.toHaveProperty('aggregateRating')
    })
    it('unlocks only populated visit facts with no blank address or hours', () => {
        const html = renderHtml(<VisitPickup facts={{ pickupDetails: 'Test collection instructions' }} />)
        expect(html).toContain('Test collection instructions')
        expect(html).not.toContain('<address')
    })
    it('renders confirmed reviews, rating, logos and a prefilled WhatsApp link', () => {
        const facts = { reviews: [{ quote: 'Test quote', author: 'Test author' }], googleRating: { value: 4.8, count: 20 }, googleBusinessProfileUrl: 'https://maps.google.com/test', clientLogos: [{ name: 'Test client', src: '/test.jpg' }], whatsappNumber: '+6599990000' }
        expect(renderHtml(<Reviews facts={facts} />)).toContain('Test quote')
        expect(renderHtml(<GoogleRating facts={facts} />)).toContain('4.8/5 on Google')
        expect(renderHtml(<ClientLogos facts={facts} />)).toContain('Test client')
        render(<WhatsAppButton facts={facts} />)
        const url = new URL(screen.getByRole('link', { name: /WhatsApp/ }).href)
        expect(url.hostname).toBe('wa.me')
        expect(url.pathname).toBe('/6599990000')
        expect(url.searchParams.get('text')).toContain('Hello Fix It Today')
    })
    it('does not show malformed phone numbers or ratings without a source', () => {
        expect(renderHtml(<WhatsAppButton facts={{ whatsappNumber: 'pending' }} />)).toBe('')
        expect(renderHtml(<GoogleRating facts={{ googleRating: { value: 5, count: 10 } }} />)).toBe('')
    })
    it('hides FAQ content and schema with fewer than three supported answers', () => {
        for (const facts of [{}, { printFileTypes: ['STL'] }, { printFileTypes: ['STL'], cardPayments: true }]) expect(renderHtml(<Faq facts={facts} />)).toBe('')
    })
    it('keeps the four visible FAQ answers identical to their schema', () => {
        const { container } = render(<Faq />)
        const schema = JSON.parse(container.querySelector('script').textContent)
        const questions = [...container.querySelectorAll('details')]
        expect(schema.mainEntity).toHaveLength(4)
        questions.forEach((node, index) => {
            expect(node.querySelector('summary').textContent).toBe(schema.mainEntity[index].name)
            expect(node.querySelector('p').textContent).toBe(schema.mainEntity[index].acceptedAnswer.text)
        })
        expect(container.textContent).not.toMatch(/turnaround|GST|purchase order|next-day|24–48/)
    })
})

describe('bulk estimate', () => {
    it.each([['PLA', 9, 1490], ['PLA', 10, 1390], ['PETG', 10, 1340], ['SPECIALTY_PLA', 10, 1890]])('matches %s at %i rolls', (ladder, quantity, cents) => {
        expect(bulkTier(ladder, quantity).unitCents).toBe(cents)
        const row = priceBulkLines([{ ladder, quantity }])[0]
        expect(row.lineCents).toBe(cents * quantity)
    })
    it('matches the shared config on both sides of every boundary for every material', () => {
        render(<BulkCalculator />)
        for (const ladder of Object.keys(BULK_LADDERS)) {
            fireEvent.change(screen.getByLabelText('Material'), { target: { value: ladder } })
            for (const { min } of BULK_BANDS) {
                for (const quantity of [Math.max(1, min - 1), min]) {
                    fireEvent.change(screen.getByLabelText('1kg rolls'), { target: { value: String(quantity) } })
                    const expected = priceBulkLines([{ ladder, quantity }])[0]
                    expect(screen.getByText(`Quantity band: ${expected.band} rolls`)).toBeInTheDocument()
                    expect(screen.getAllByText(`S$${(expected.unitCents / 100).toFixed(2)}`).length).toBeGreaterThan(0)
                    expect(screen.getAllByText(`S$${(expected.lineCents / 100).toFixed(2)}`).length).toBeGreaterThan(0)
                }
            }
        }
    })
    it.each(['', '0', '-1', '1.5', '1000001'])('handles invalid quantity %s without a stale estimate or network request', quantity => {
        const fetch = vi.fn()
        vi.stubGlobal('fetch', fetch)
        render(<BulkCalculator />)
        fireEvent.change(screen.getByLabelText('1kg rolls'), { target: { value: quantity } })
        expect(screen.getByLabelText('1kg rolls')).toHaveAttribute('aria-invalid', 'true')
        expect(screen.queryByText('Indicative total')).toBeNull()
        expect(fetch).not.toHaveBeenCalled()
    })
})

describe('hero and motion', () => {
    it('preloads the current poster and exposes three primary destinations', () => {
        render(<Hero content={{ heroImage: 'admin/uploads/home/current.jpg' }} />)
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Print, fix and build in Singapore')
        const image = screen.getByRole('img')
        expect(image).toHaveAttribute('data-priority', 'true')
        expect(image).toHaveAttribute('fetchpriority', 'high')
        expect(image).toHaveAttribute('sizes')
        expect(image).toHaveAttribute('src', '/api/proxy?key=admin%2Fuploads%2Fhome%2Fcurrent.jpg')
        expect(screen.getByRole('link', { name: /Get a print quote/ })).toHaveAttribute('href', '/prints/request')
        expect(screen.getByRole('link', { name: /Book a repair/ })).toHaveAttribute('href', '/printer-repair')
        expect(screen.getByRole('link', { name: /Shop filament/ })).toHaveAttribute('href', '/shop?productCategory=Filament')
    })
    it.each([[true, false], [false, true], [true, true], [false, false]])('respects reduced motion %s and Save-Data %s', (reduced, saveData) => {
        vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
        vi.stubGlobal('navigator', { connection: { saveData } })
        const { container } = render(<HeroVideo src="/confirmed-video.mp4" poster="/confirmed-poster.jpg" />)
        const video = container.querySelector('video')
        expect(Boolean(video)).toBe(!reduced && !saveData)
        if (video) {
            expect(video).toHaveAttribute('autoplay')
            expect(video.muted).toBe(true)
            expect(video).toHaveAttribute('loop')
            expect(video).toHaveAttribute('playsinline')
            expect(video).toHaveAttribute('preload', 'metadata')
        }
    })
})

describe('photo filtering and section controls', () => {
    it.each([null, '', '/placeholder.jpg', '/product-images/photo-pending.svg', '/coming-soon.png', '/image.png', '/fitogimage.png', '/api/proxy?key=images%2Fphoto-pending.svg', 'https://unknown.example/photo.jpg'])('rejects unusable image %s', value => {
        expect(realImageSrc(value)).toBeNull()
    })
    it('uses a real secondary image and excludes hidden, moderated and duplicate products', () => {
        const p = { ...product(1), images: ['/placeholder.jpg', '/images/real.jpg'] }
        const picks = selectShopPicks([p, { ...product(2), hidden: true }, { ...product(3), flaggedForModeration: true }, p])
        expect(picks).toHaveLength(1)
        expect(picks[0].homeImage).toBe('/images/real.jpg')
    })
    it('hides insufficient shop picks and caps a populated grid at eight', () => {
        expect(renderHtml(<ShopPicks products={[product(1), product(2), product(3)]} />)).toBe('')
        render(<ShopPicks products={Array.from({ length: 10 }, (_, i) => product(i))} />)
        expect(screen.getAllByRole('img')).toHaveLength(8)
    })
    it('renders no placeholders or unconfirmed schemas in the default v2 home', () => {
        const html = renderHtml(<HomeContent />)
        expect(html).not.toMatch(/LocalBusiness|aggregateRating|wa\.me|coming soon|placeholder/i)
        expect((html.match(/<h1\b/g) || []).length).toBe(1)
    })
    it('honours every built section toggle, including FAQ schema', () => {
        const sections = Object.fromEntries(HOME_SECTIONS.map(key => [key, false]))
        const html = renderHtml(<HomeContent sections={sections} products={[1, 2, 3, 4].map(i => product(i))} posts={[{ title: 'Test guide', slug: 'test-guide' }]} />)
        expect(html).not.toContain('<section')
        expect(html).not.toContain('application/ld+json')
        expect((html.match(/<h1\b/g) || []).length).toBe(1)
    })
})
