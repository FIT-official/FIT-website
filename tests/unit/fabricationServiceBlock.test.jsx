import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import FabricationServiceBlock from '@/components/Fabrication/FabricationServiceBlock'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('keeps storefront content visible with no service panel or console errors for a disabled service', async () => {
    const read = vi.fn(async () => ({ enabled: false }))
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: read })))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(<main><h1>Maker store</h1><FabricationServiceBlock creator={{ id: 'shop' }} /><p>Products</p></main>)
    await waitFor(() => expect(read).toHaveBeenCalledOnce())
    expect(screen.getByRole('heading', { name: 'Maker store' })).toBeInTheDocument()
    expect(screen.getByText('Products')).toBeInTheDocument()
    expect(container.querySelector('section')).toBeNull()
    expect(errorLog).not.toHaveBeenCalled()
})
