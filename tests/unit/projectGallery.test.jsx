import React from 'react'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import ProjectGallery from '@/components/Programmes/ProjectGallery'
import { escapeRoomPhotos, schoolGalleryPhotos } from '@/components/Programmes/workshopPhotos'

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
        await user.click(screen.getByRole('button', { name: /View all 23 photos/ }))
        expect(screen.getAllByRole('link', { name: /^Enlarge:/ })).toHaveLength(23)
        await user.click(screen.getByRole('button', { name: 'School workshops / NYGH' }))
        expect(screen.getAllByRole('link', { name: /^Enlarge:/ })).toHaveLength(5)
        expect(screen.getByRole('button', { name: 'School workshops / NYGH' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.queryByRole('link', { name: /completed miniature/ })).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'All photos' }))
        expect(screen.getAllByRole('link', { name: /^Enlarge:/ })).toHaveLength(8)
    })

    it('opens the original frame, navigates with keys, and restores focus and scrolling on Escape', async () => {
        const user = userEvent.setup()
        gallery()
        const trigger = screen.getByRole('link', { name: /Enlarge: The team with/ })
        expect(trigger).toHaveAttribute('href', escapeRoomPhotos[0].src)
        await user.click(trigger)
        const modal = screen.getByRole('dialog', { name: 'Project photos' })
        expect(within(modal).getByRole('img')).toHaveAttribute('src', escapeRoomPhotos[0].src)
        expect(document.body.style.overflow).toBe('hidden')
        fireEvent.keyDown(modal, { key: 'ArrowLeft' })
        expect(within(modal).getByText('23 / 23')).toBeInTheDocument()
        await user.click(within(modal).getByRole('button', { name: 'Next photo' }))
        expect(within(modal).getByText('1 / 23')).toBeInTheDocument()
        fireEvent(modal, new Event('cancel', { cancelable: true }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(document.body.style.overflow).toBe('')
        expect(trigger).toHaveFocus()
    })

    it('navigates only the selected album and closes using the close button', async () => {
        const user = userEvent.setup()
        gallery()
        await user.click(screen.getByRole('button', { name: 'School workshops / NYGH' }))
        await user.click(screen.getAllByRole('link', { name: /^Enlarge:/ })[0])
        const modal = screen.getByRole('dialog')
        await user.click(within(modal).getByRole('button', { name: 'Previous photo' }))
        expect(within(modal).getByText('5 / 5')).toBeInTheDocument()
        await user.click(within(modal).getByRole('button', { name: 'Close photo viewer' }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('ships every distinct photo with dimensions and a usable description', () => {
        expect(escapeRoomPhotos).toHaveLength(18)
        expect(schoolGalleryPhotos).toHaveLength(23)
        expect(new Set(schoolGalleryPhotos.map(photo => photo.src)).size).toBe(23)
        for (const photo of schoolGalleryPhotos) {
            expect(existsSync(`public${photo.src}`)).toBe(true)
            expect(photo.width).toBeGreaterThan(0)
            expect(photo.height).toBeGreaterThan(0)
            expect(photo.alt.length).toBeGreaterThan(20)
        }
    })
})

