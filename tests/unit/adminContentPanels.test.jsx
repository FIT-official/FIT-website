// RTL smokes for the two rethought admin input surfaces: Site Content's
// spatial page map (tabs + miniature page blocks driving ?sub=) and the
// custom print product document (numbered chapters, TOC rail, completeness
// summary, discount disclosure). Shared field components are mocked at the
// boundary; these tests pin the panels' own structure and wiring.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import ContentManagement from '@/components/Admin/DynamicContentManagement'
import CustomPrintProductManagement from '@/components/Admin/CustomPrintProductManagement'

vi.mock('@/components/General/ToastProvider', () => ({
    useToast: () => ({ showToast: vi.fn() }),
}))

// Heavy / fetch-y CMS field editors are not under test here.
vi.mock('@/components/Admin/CMSFields/RichTextEditor', () => ({ default: ({ label }) => <div>RTE:{label}</div> }))
vi.mock('@/components/Admin/CMSFields/ImageUpload', () => ({ default: ({ label }) => <div>IMG:{label}</div> }))
vi.mock('@/components/Admin/CMSFields/ProductSearch', () => ({ default: ({ label }) => <div>PS:{label}</div> }))
vi.mock('@/components/Admin/CMSFields/CategoryInput', () => ({ default: ({ label }) => <div>CAT:{label}</div> }))
vi.mock('@/components/Admin/CMSFields/ArrayField', () => ({ default: ({ label }) => <div>ARR:{label}</div> }))
vi.mock('@/components/Admin/CMSFields/NavMenuPagesField', () => ({ default: ({ label }) => <div>NAVPAGES:{label}</div> }))
vi.mock('@/components/Admin/CMSFields/BlogPostPicker', () => ({ default: ({ label }) => <div>BLOGPICK:{label}</div> }))

// Shared product-form field groups (owned elsewhere) reduced to markers.
vi.mock('@/components/DashboardComponents/ProductFormFields/PricingFields', () => ({ default: () => <div>PricingFieldsMock</div> }))
vi.mock('@/components/DashboardComponents/ProductFormFields/ShippingFields', () => ({ default: () => <div>ShippingFieldsMock</div> }))
vi.mock('@/components/DashboardComponents/ProductFormFields/DiscountsField', () => ({ default: () => <div>DiscountsFieldMock</div> }))
vi.mock('@/components/DashboardComponents/ProductFormFields/ImagesField', () => ({ default: () => <div>ImagesFieldMock</div> }))

const ok = (payload) => Promise.resolve({ ok: true, json: async () => payload })

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    window.history.replaceState(null, '', '/')
    window.localStorage.clear()
})

describe('ContentManagement — spatial page map picker', () => {
    beforeEach(() => {
        window.history.replaceState(null, '', '/')
        global.fetch = vi.fn((url) => {
            const u = String(url)
            if (u.includes('/api/admin/content')) return ok({ frontmatter: {}, content: '' })
            return ok({})
        })
    })

    it('shows page tabs and the homepage map with plain-language regions', async () => {
        render(<ContentManagement />)
        await screen.findByRole('button', { name: 'Featured products' })

        // One tab per page group (§9.3).
        expect(screen.getByRole('tab', { name: 'Home' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'About' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Shop & Prints' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Legal' })).toBeInTheDocument()

        // Homepage blocks in page order, plus fixed context blocks.
        expect(screen.getByRole('button', { name: 'Announcement bar' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Hero banner' })).toBeInTheDocument()
        // The print request strip (home/print-cta) sits between the hero and featured products.
        expect(screen.getByRole('button', { name: 'Print request strip' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Testimonials' })).toBeInTheDocument()
        expect(screen.getByText('Footer')).toBeInTheDocument()

        // Default region is selected and named in the save bar.
        expect(screen.getByRole('button', { name: 'Featured products', pressed: true })).toBeInTheDocument()
    })

    it('clicking a region fetches its content and mirrors it into ?sub=', async () => {
        render(<ContentManagement />)
        await screen.findByRole('button', { name: 'Featured products' })

        fireEvent.click(screen.getByRole('button', { name: 'Hero banner' }))

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith('/api/admin/content?path=home/hero-banner')
        })
        expect(screen.getByRole('button', { name: 'Hero banner', pressed: true })).toBeInTheDocument()
        expect(decodeURIComponent(window.location.search)).toContain('sub=home/hero-banner')
    })

    it('shows the Navigation tab whose mega-menu region renders the nav CMS fields', async () => {
        render(<ContentManagement />)
        await screen.findByRole('button', { name: 'Featured products' })

        fireEvent.click(screen.getByRole('tab', { name: 'Navigation' }))

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith('/api/admin/content?path=navigation/mega-menu')
        })
        expect(screen.getByRole('button', { name: 'Navbar mega menu', pressed: true })).toBeInTheDocument()
        // Fixed context block so the map reads spatially.
        expect(screen.getByText('Menu bar')).toBeInTheDocument()
        // Both dedicated field editors render for the region.
        expect(await screen.findByText('NAVPAGES:Menu pages')).toBeInTheDocument()
        expect(screen.getByText('BLOGPICK:Featured articles')).toBeInTheDocument()
    })

    it('saving the mega-menu region PUTs menuPages and featuredPosts', async () => {
        const menuPages = [{ icon: 'mail', label: 'Contact', description: 'Say hello.', href: '/contact' }]
        const featuredPosts = [{ slug: 'cms-pick', title: 'CMS pick' }]
        global.fetch = vi.fn((url, init) => {
            const u = String(url)
            if (u.includes('/api/admin/content') && init?.method === 'PUT') return ok({ success: true })
            if (u.includes('/api/admin/content')) return ok({ frontmatter: { menuPages, featuredPosts }, content: '' })
            return ok({})
        })

        render(<ContentManagement />)
        await screen.findByRole('button', { name: 'Featured products' })
        fireEvent.click(screen.getByRole('tab', { name: 'Navigation' }))
        await screen.findByText('NAVPAGES:Menu pages')

        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

        await waitFor(() => {
            const putCall = global.fetch.mock.calls.find(([, init]) => init?.method === 'PUT')
            expect(putCall).toBeTruthy()
            const body = JSON.parse(putCall[1].body)
            expect(body.contentPath).toBe('navigation/mega-menu')
            expect(body.frontmatter.menuPages).toEqual(menuPages)
            expect(body.frontmatter.featuredPosts).toEqual(featuredPosts)
        })
    })

    it('switching to the Legal tab lands on the terms document', async () => {
        render(<ContentManagement />)
        await screen.findByRole('button', { name: 'Featured products' })

        fireEvent.click(screen.getByRole('tab', { name: 'Legal' }))

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith('/api/admin/content?path=terms/content')
        })
        expect(screen.getByRole('button', { name: 'Terms of service', pressed: true })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Privacy policy' })).toBeInTheDocument()
    })
})

describe('Nav CMS field editors (actual components)', () => {
    it('NavMenuPagesField renders the curated icon picker and validates hrefs', async () => {
        const { default: NavMenuPagesField } = await vi.importActual(
            '@/components/Admin/CMSFields/NavMenuPagesField',
        )
        const onChange = vi.fn()
        render(
            <NavMenuPagesField
                label="Menu pages"
                value={[{ icon: 'mail', label: 'Contact', description: '', href: 'contact' }]}
                onChange={onChange}
            />,
        )

        // Curated named set: 12 visual icon buttons, current one pressed.
        expect(screen.getAllByRole('button', { name: /icon$/ })).toHaveLength(12)
        expect(screen.getByRole('button', { name: 'mail icon', pressed: true })).toBeInTheDocument()

        // href without a leading / or http(s) is flagged inline.
        expect(screen.getByText(/must start with \/ or http/i)).toBeInTheDocument()

        // Picking another icon writes the icon name back through onChange.
        fireEvent.click(screen.getByRole('button', { name: 'home icon' }))
        expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ icon: 'home' })])
    })

    it('NavMenuPagesField caps the list at maxItems', async () => {
        const { default: NavMenuPagesField } = await vi.importActual(
            '@/components/Admin/CMSFields/NavMenuPagesField',
        )
        const items = Array.from({ length: 8 }, (_, i) => ({
            icon: 'home',
            label: `Page ${i}`,
            description: '',
            href: '/',
        }))
        render(<NavMenuPagesField label="Menu pages" value={items} onChange={vi.fn()} maxItems={8} />)
        expect(screen.getByRole('button', { name: 'Add page link' })).toBeDisabled()
    })

    it('BlogPostPicker fetches the published lean list on focus and adds a selection', async () => {
        global.fetch = vi.fn(() =>
            ok({ ok: true, posts: [{ slug: 'alpha-post', title: 'Alpha' }, { slug: 'beta-post', title: 'Beta' }] }),
        )
        const { default: BlogPostPicker } = await vi.importActual(
            '@/components/Admin/CMSFields/BlogPostPicker',
        )
        const onChange = vi.fn()
        render(<BlogPostPicker label="Featured articles" value={[]} onChange={onChange} />)

        fireEvent.focus(screen.getByPlaceholderText(/search published posts/i))
        expect(global.fetch).toHaveBeenCalledWith('/api/admin/blog?all=1&status=published')

        fireEvent.click(await screen.findByRole('button', { name: /Alpha/ }))
        expect(onChange).toHaveBeenCalledWith([{ slug: 'alpha-post', title: 'Alpha' }])
    })

    it('BlogPostPicker disables search at the 4-article cap and removes selections', async () => {
        const { default: BlogPostPicker } = await vi.importActual(
            '@/components/Admin/CMSFields/BlogPostPicker',
        )
        const selected = Array.from({ length: 4 }, (_, i) => ({ slug: `post-${i}`, title: `Post ${i}` }))
        const onChange = vi.fn()
        render(<BlogPostPicker label="Featured articles" value={selected} onChange={onChange} />)

        expect(screen.getByPlaceholderText(/maximum of 4 articles/i)).toBeDisabled()
        fireEvent.click(screen.getByRole('button', { name: 'Remove Post 0' }))
        expect(onChange).toHaveBeenCalledWith(selected.slice(1))
    })
})

describe('CustomPrintProductManagement — chaptered document', () => {
    beforeEach(() => {
        global.fetch = vi.fn((url) => {
            const u = String(url)
            if (u.includes('/api/product/custom-print-config')) {
                return ok({
                    product: {
                        _id: 'prod_1',
                        name: 'Custom 3D Print',
                        description: 'We print your models.',
                        images: ['a.png'],
                        basePrice: { presentmentCurrency: 'SGD', presentmentAmount: 25 },
                        priceCredits: 0,
                        delivery: { deliveryTypes: [{ deliveryTypeId: 'dt_1', price: 5 }] },
                        dimensions: { length: '', width: '', height: '', weight: '' },
                        discount: {},
                    },
                })
            }
            if (u.includes('/api/admin/events')) return ok({ events: [] })
            return ok({})
        })
    })

    it('renders five numbered chapters with a contents rail and completeness summary', async () => {
        render(<CustomPrintProductManagement />)
        await screen.findByRole('heading', { name: 'Basics' })

        for (const title of ['Basics', 'Photos', 'Pricing', 'Delivery', 'Discounts']) {
            expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
        }

        // TOC rail with numbered jump links.
        const rail = screen.getByRole('navigation', { name: 'Form contents' })
        expect(within(rail).getByRole('button', { name: /1\. Basics/ })).toBeInTheDocument()
        expect(within(rail).getByRole('button', { name: /5\. Discounts/ })).toBeInTheDocument()

        // All four required chapters are complete for this fixture.
        expect(screen.getByText('4 of 4 sections ready')).toBeInTheDocument()

        // Every relocated field surface is still present.
        expect(screen.getByText('ImagesFieldMock')).toBeInTheDocument()
        expect(screen.getByText('PricingFieldsMock')).toBeInTheDocument()
        expect(screen.getByText('ShippingFieldsMock')).toBeInTheDocument()
    })

    it('keeps discount settings behind a disclosure until asked for', async () => {
        render(<CustomPrintProductManagement />)
        await screen.findByRole('heading', { name: 'Discounts' })

        expect(screen.queryByText('DiscountsFieldMock')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Set up a discount' }))
        expect(screen.getByText('DiscountsFieldMock')).toBeInTheDocument()
    })
})
