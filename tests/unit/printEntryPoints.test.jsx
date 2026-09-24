// Entry points into /prints/request: the prints-page tile and the homepage
// strip. Both work signed out and need no custom-print product.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
vi.mock('next/link', () => ({ default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a> }))
vi.mock('next/image', () => ({ default: ({ alt, ...props }) =>
    // eslint-disable-next-line @next/next/no-img-element -- plain DOM image stands in for next/image
    <img alt={alt} {...props} /> }))
import CustomPrintCard from '@/components/CustomPrintCard'
import PrintRequestCta, { PRINT_CTA_DEFAULTS } from '@/components/Home/PrintRequestCta'

afterEach(cleanup)

describe('CustomPrintCard', () => {
    it('is a same-tab link to the request page with no price and no product required', () => {
        render(<CustomPrintCard />)
        const link = screen.getByRole('link', { name: /Get a 3D print made/ })
        expect(link).toHaveAttribute('href', '/prints/request')
        expect(link).not.toHaveAttribute('target')
        expect(screen.getByText('Upload a model, pick material and colour, see the price.')).toBeInTheDocument()
        expect(screen.queryByText(/From SGD|Price on request/)).toBeNull()
        expect(screen.queryByRole('button')).toBeNull()
    })
    it('shows the product image when the admin has set one', () => {
        render(<CustomPrintCard product={{ images: ['admin/print.jpg'], basePrice: { presentmentAmount: 15 } }} />)
        expect(screen.getByRole('img', { name: 'Custom 3D printing' })).toHaveAttribute('src', '/api/proxy?key=admin%2Fprint.jpg')
        expect(screen.queryByText(/15/)).toBeNull()
    })
})

describe('homepage print request strip', () => {
    beforeEach(() => { global.fetch = vi.fn(async () => ({ ok: false })) })
    it('renders the default copy and links to the request page', async () => {
        render(<PrintRequestCta />)
        expect(screen.getByRole('heading', { name: PRINT_CTA_DEFAULTS.title })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: PRINT_CTA_DEFAULTS.buttonText })).toHaveAttribute('href', '/prints/request')
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/content?path=home/print-cta', expect.anything()))
    })
    it('uses the CMS copy from home/print-cta when it exists', async () => {
        global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ frontmatter: { title: 'Print it with us', buttonText: 'Upload a model' }, content: '' }) }))
        render(<PrintRequestCta />)
        expect(await screen.findByRole('heading', { name: 'Print it with us' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Upload a model' })).toHaveAttribute('href', '/prints/request')
        expect(screen.getByText(PRINT_CTA_DEFAULTS.text)).toBeInTheDocument()
    })
})
