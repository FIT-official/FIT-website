import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { workshopGroupPage, workshopClassroomGroupPage, assertWorkshopImagesReady } from '@/lib/workshopPages'
// Real Next Image is exercised by the build; this DOM adapter exposes its asset mapping.
// eslint-disable-next-line @next/next/no-img-element
vi.mock('next/image', () => ({ default: ({ src, alt, width, height }) => <img src={src} alt={alt} width={width} height={height} /> }))
vi.mock('next/link', () => ({ default: ({ href, children }) => <a href={href}>{children}</a> }))
import ReviewedGroupPage from '@/components/Workshop/ReviewedGroupPage'
afterEach(cleanup)
it('renders every verified PDF-derived asset with matching public and classroom captions', () => {
    expect(assertWorkshopImagesReady()).toBe(true)
    const urls = new Set()
    for (let n = 1; n <= 10; n++) {
        const group = workshopGroupPage('g' + n), classroom = workshopClassroomGroupPage('g' + n)
        expect(group.models).toHaveLength(2)
        for (const [i, image] of group.models.entries()) {
            urls.add(image.src)
            expect(classroom.reading.ideas[i].illustrations[0]).toEqual(image)
            expect(createHash('sha256').update(readFileSync('public' + image.src)).digest('hex')).toBe(image.sha256)
            expect(image.registryVersion).toBe(3)
            expect(image.caption).toBe(classroom.reading.ideas[i].pupilCopy.source_caveat)
            expect(image.sourcePdfSha256).toBe('de0272d6bdde164ec6c0f4490d2e2b5243f2c761a61ffdfa30d337f5659b8cc9')
        }
        for (const isClassroom of [false, true]) {
            render(<ReviewedGroupPage group={isClassroom ? classroom : group} classroom={isClassroom} />)
            expect(screen.getAllByRole('img')).toHaveLength(2)
            for (const image of group.models) {
                expect(screen.getByRole('img', { name: image.alt })).toHaveAttribute('src', image.src)
                expect(screen.getByText(image.caption, { selector: 'figcaption' })).toBeInTheDocument()
            }
            cleanup()
        }
    }
    expect(urls.size).toBe(20)
    expect(workshopGroupPage('g1').models[0].caption).toContain('carried or stay on a table')
    expect(workshopGroupPage('g3').models[0].caption).toContain('receive HELLO')
    expect(workshopGroupPage('g7').models[1].caption).toContain('unclear item back safely')
    expect(workshopGroupPage('g8').models[0]).toMatchObject({ width: 1660, height: 948 })
})
