import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import MakerAccessPage, { metadata } from '@/app/about/makeraccess/page'

afterEach(cleanup)

describe('MakerAccess public page', () => {
    it('provides numbered-item guides and the verified public resources without a login', () => {
        render(<MakerAccessPage />)
        expect(screen.getByRole('heading', { level: 1, name: 'MakerAccess' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Find your item guide' })).toHaveAttribute('href', '/blog/maker-access-projects')
        expect(screen.getByRole('link', { name: /Product feedback/ })).toHaveAttribute('href', 'https://forms.office.com/r/1kuzRsFGHz')
        expect(screen.getByRole('link', { name: /MakerAccess survey/ })).toHaveAttribute('href', 'https://forms.office.com/r/HPrZ0Mhc6G')
        expect(screen.getByRole('link', { name: /Contact and mailing list/ })).toHaveAttribute('href', 'https://linktr.ee/makeraccess')
        expect(screen.getByRole('link', { name: /Fix It Today on Instagram/ })).toHaveAttribute('href', 'https://www.instagram.com/fixittodaysg')
        expect(screen.getByRole('link', { name: 'FIT Class' })).toHaveAttribute('href', '/class')
        expect(screen.getByRole('link', { name: 'About the Founder' })).toHaveAttribute('href', 'https://leewenwei.com')
        const links = screen.getAllByRole('link').map(link => link.getAttribute('href'))
        expect(links.filter(href => /workshop|admin|sign-in/.test(href))).toEqual([])
        expect(screen.getAllByRole('listitem')).toHaveLength(3)
        expect(screen.getByRole('img', { name: /Arduino, breadboard and servo/ })).toHaveAttribute('src', expect.stringContaining('sensor-servo-circuit.webp'))
        expect(screen.getByRole('link', { name: 'Open the toast-shaped clicker guide' })).toHaveAttribute('href', '/blog/makeraccess-toast-fidget-clicker')
    })

    it('uses the canonical site origin for search and social metadata', () => {
        expect(metadata.alternates.canonical).toBe('https://www.fixitoday.com/about/makeraccess')
        expect(metadata.openGraph.url).toBe(metadata.alternates.canonical)
    })
})
