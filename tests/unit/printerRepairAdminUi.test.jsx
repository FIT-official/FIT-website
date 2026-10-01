import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PrinterRepairManagement from '@/components/Admin/PrinterRepairManagement'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('printer assessment administration diagnostics', () => {
  it.each(['rate_limit_unavailable', 'service_unavailable', 'storage_unavailable'])('shows the bounded server reference for %s', async code => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'This service is temporarily unavailable.', code }), { status: 503 })))
    render(<PrinterRepairManagement />)
    expect(await screen.findByRole('alert')).toHaveTextContent(`Reference: ${code}.`)
  })
  it('does not expose an arbitrary error-code value as a support reference', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Unavailable.', code: 'private-fixture-value' }), { status: 503 })))
    render(<PrinterRepairManagement />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable.')
    expect(screen.getByRole('alert')).not.toHaveTextContent('private-fixture-value')
  })
})
