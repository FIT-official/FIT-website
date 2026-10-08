import React from 'react'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import ProjectGallery from '@/components/Programmes/ProjectGallery'
import { escapeRoomPhotos, schoolGalleryPhotos, companyGalleryPhotos, teachingPhotos } from '@/components/Programmes/workshopPhotos'

vi.mock('next/image', () => ({ default: ({ src, alt }) =>
    // eslint-disable-next-line @next/next/no-img-element -- Image test double.
    <img src={src} alt={alt} />,
}))

const dialogMethods = { showModal: HTMLDialogElement.prototype.showModal, close: HTMLDialogElement.prototype.close }
beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
    HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); Object.assign(HTMLDialogElement.prototype, dialogMethods) })

const gallery = () => render(<ProjectGallery photos={schoolGalleryPhotos} title="Projects in pictures" intro="From the workshop." />)

describe('project photo gallery', () => {
    it('reveals the complete album and filters it without mixing projects', async () => {
        const user = userEvent.setup()
        gallery()
        expect(screen.getAllByRole('link', { name: /^Enlarge:/ })).toHaveLength(8)
        await user.click(screen.getByRole('button', { name: /View all 14 photos/ }))
        expect(screen.getAllByRole('link', { name: /^Enlarge:/ })).toHaveLength(14)
        await user.click(screen.getByRole('button', { name: '3D design and model making' }))
        expect(screen.getAllByRole('link', { name: /^Enlarge:/ })).toHaveLength(7)
        expect(screen.getByRole('button', { name: '3D design and model making' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.queryByRole('link', { name: /completed miniature/ })).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'All photos' }))
        expect(screen.getAllByRole('link', { name: /^Enlarge:/ })).toHaveLength(8)
    })

    it('opens the original frame, navigates with keys, and restores focus and scrolling on Escape', async () => {
        const user = userEvent.setup()
        gallery()
        const trigger = screen.getByRole('link', { name: /Enlarge: Classroom teaching/ })
        expect(trigger).toHaveAttribute('href', teachingPhotos[0].src)
        await user.click(trigger)
        const modal = screen.getByRole('dialog', { name: 'Project photos' })
        expect(within(modal).getByRole('img')).toHaveAttribute('src', teachingPhotos[0].src)
        expect(document.body.style.overflow).toBe('hidden')
        fireEvent.keyDown(modal, { key: 'ArrowLeft' })
        expect(within(modal).getByText('14 / 14')).toBeInTheDocument()
        await user.click(within(modal).getByRole('button', { name: 'Next photo' }))
        expect(within(modal).getByText('1 / 14')).toBeInTheDocument()
        fireEvent(modal, new Event('cancel', { cancelable: true }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(document.body.style.overflow).toBe('')
        expect(trigger).toHaveFocus()
    })

    it('navigates only the selected album and closes using the close button', async () => {
        const user = userEvent.setup()
        gallery()
        await user.click(screen.getByRole('button', { name: '3D design and model making' }))
        await user.click(screen.getAllByRole('link', { name: /^Enlarge:/ })[0])
        const modal = screen.getByRole('dialog')
        await user.click(within(modal).getByRole('button', { name: 'Previous photo' }))
        expect(within(modal).getByText('7 / 7')).toBeInTheDocument()
        await user.click(within(modal).getByRole('button', { name: 'Close photo viewer' }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('ships every distinct photo with dimensions and a usable description', () => {
        expect(escapeRoomPhotos).toHaveLength(7)
        expect(schoolGalleryPhotos).toHaveLength(14)
        expect(new Set(schoolGalleryPhotos.map(photo => photo.src)).size).toBe(14)
        expect(schoolGalleryPhotos.some(photo => photo.src.includes('nygh-printed-mechanism'))).toBe(false)
        expect(schoolGalleryPhotos.map(({ alt, caption, album }) => ({ alt, caption, album }))).not.toEqual(expect.arrayContaining([expect.objectContaining({ album: 'School workshops / NYGH' })]))
        expect(companyGalleryPhotos).toHaveLength(10)
        for (const photo of [...schoolGalleryPhotos, ...companyGalleryPhotos]) {
            expect(existsSync(`public${photo.src}`)).toBe(true)
            expect(photo.width).toBeGreaterThan(0)
            expect(photo.height).toBeGreaterThan(0)
            expect(photo.alt.length).toBeGreaterThan(20)
        }
    })
})

