import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AddToClass from '@/components/sims/AddToClass'
import ClassSimulations from '@/components/sims/ClassSimulations'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('class simulation controls', () => {
    it('adds in one click and announces completion without background auth requests', async () => {
        const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ saved: true }) }))
        vi.stubGlobal('fetch', fetch)
        render(<AddToClass simId="sampling" />)
        expect(fetch).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: 'Add to class' }))
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Added to Workshop class.'))
        expect(fetch).toHaveBeenCalledOnce()
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ simId: 'sampling' })
        expect(screen.getByRole('button', { name: 'Added to class' })).toBeDisabled()
        expect(screen.getByRole('link', { name: /Open class/ })).toHaveAttribute('href', '/admin/workshop')
    })

    it('offers the existing teacher sign-in when access is rejected', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Class login required.' }) })))
        render(<AddToClass simId="sampling" />)
        fireEvent.click(screen.getByRole('button', { name: 'Add to class' }))
        await waitFor(() => expect(screen.getByRole('link', { name: /Teacher sign in/ })).toHaveAttribute('href', '/sign-in?redirect_url=%2Fclass%2Fsimulations'))
    })

    it('keeps failed additions retryable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Offline. Please reconnect.') }))
        render(<AddToClass simId="sampling" />)
        fireEvent.click(screen.getByRole('button', { name: 'Add to class' }))
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Offline. Please reconnect.'))
        expect(screen.getByRole('button', { name: 'Add to class' })).toBeEnabled()
    })

    it('shows only live activities with their prompt and a lazy same-site iframe', async () => {
        const { container } = render(<ClassSimulations simIds={['sampling', 'unpublished-activity', 'sampling']} />)
        expect(screen.getByRole('heading', { name: 'Signal Sampling Detective' })).toBeInTheDocument()
        expect(screen.getByText(/Predict which slower wave/)).toBeInTheDocument()
        await screen.findByTitle('Signal Sampling Detective simulation')
        const frames = container.querySelectorAll('iframe')
        expect(frames).toHaveLength(1)
        expect(frames[0]).toHaveAttribute('src', '/embed/sims/sampling')
        expect(frames[0]).toHaveAttribute('loading', 'lazy')
        expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
    })

    it('waits until a class experiment enters the viewport before mounting its player', async () => {
        let intersect
        const disconnect = vi.fn()
        vi.stubGlobal('IntersectionObserver', class {
            constructor(callback) { intersect = callback }
            observe() {}
            disconnect() { disconnect() }
        })
        const { container } = render(<ClassSimulations simIds={['sampling']} />)
        expect(container.querySelector('iframe')).toBeNull()
        act(() => intersect([{ isIntersecting: false }]))
        expect(container.querySelector('iframe')).toBeNull()
        act(() => intersect([{ isIntersecting: true }]))
        expect(await screen.findByTitle('Signal Sampling Detective simulation')).toBeInTheDocument()
        expect(disconnect).toHaveBeenCalled()
    })

    it('allows teachers to remove assignments while empty student classes stay unchanged', () => {
        const remove = vi.fn()
        const { rerender, container } = render(<ClassSimulations simIds={['sampling']} teacher onRemove={remove} />)
        fireEvent.click(screen.getByRole('button', { name: 'Remove Signal Sampling Detective from class' }))
        expect(remove).toHaveBeenCalledWith('sampling')
        rerender(<ClassSimulations />)
        expect(container).toBeEmptyDOMElement()
    })
})
