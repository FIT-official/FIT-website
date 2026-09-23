import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Main from '@/components/Home/Main'

vi.mock('next/image', () => ({ default: ({ fill, priority, alt, ...props }) =>
    // eslint-disable-next-line @next/next/no-img-element -- Exercise image load failures through a DOM image.
    <img {...props} alt={alt} data-priority={priority ? 'true' : undefined} />,
}))
vi.mock('framer-motion', () => ({
    cubicBezier: vi.fn(),
    motion: {
        div: ({ variants, initial, animate, children, ...props }) => <div {...props}>{children}</div>,
        span: ({ variants, children, ...props }) => <span {...props}>{children}</span>,
    },
}))

afterEach(cleanup)
const saved = { text: 'Printer repair and filament', heroImage: 'admin/uploads/home/hero/current banner.jpg', darkOverlay: true }
const savedSrc = '/api/proxy?key=admin%2Fuploads%2Fhome%2Fhero%2Fcurrent%20banner.jpg'

describe('homepage banner first render', () => {
    it('renders the saved image and copy in the initial HTML without browser effects', () => {
        const html = renderToStaticMarkup(<Main initialHeroContent={saved} />)
        expect(html).toContain(`src="${savedSrc}"`)
        expect(html).toContain('sizes="100vw"')
        expect(html).toContain('data-priority="true"')
        expect(html).toContain(saved.text)
        expect(html).not.toContain('placeholder.jpg')
        expect(html).not.toContain('opacity-0')
    })

    it.each([undefined, { heroImage: null }, { heroImage: '/placeholder.jpg' }])('keeps a neutral branded banner when no saved image is available', content => {
        render(<Main initialHeroContent={content} />)
        expect(screen.queryByRole('img')).toBeNull()
        expect(screen.getByLabelText('FIX IT TODAY®')).toBeInTheDocument()
    })

    it('keeps the saved copy after an image failure and recovers for a new banner without loading the cat', () => {
        const { rerender, container } = render(<Main initialHeroContent={saved} />)
        fireEvent.error(screen.getByRole('img'))
        expect(screen.queryByRole('img')).toBeNull()
        expect(screen.getByText(saved.text)).toBeInTheDocument()
        expect(container.innerHTML).not.toContain('placeholder.jpg')
        rerender(<Main initialHeroContent={{ ...saved, heroImage: '/new-banner.jpg' }} />)
        expect(screen.getByRole('img')).toHaveAttribute('src', '/new-banner.jpg')
    })

    it('uses an already public image URL directly on the first render', () => {
        render(<Main initialHeroContent={{ ...saved, heroImage: 'https://fixittoday.s3.amazonaws.com/banner.jpg' }} />)
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://fixittoday.s3.amazonaws.com/banner.jpg')
    })
})
