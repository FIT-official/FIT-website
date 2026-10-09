import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

const row = email => ({ requestId: '99b6b123-55fa-4e78-a967-ec539a2f46ee', brief: { brand: 'Synthetic', model: 'Printer', contactName: 'Fixture' }, status: 'assessment_requested', createdAt: '2026-10-01T00:00:00Z', photoCount: 0, ownerEmail: email })
it('shows a safe retry for a definite failure and updates provider acceptance without claiming inbox delivery', async () => {
  const fetch = vi.fn(async (_url, options) => new Response(JSON.stringify(options?.method === 'POST'
    ? { requestId: row().requestId, ownerEmail: { status: 'accepted', attempts: 2, canRetry: false } }
    : { requests: [row({ status: 'failed', attempts: 1, canRetry: true })], nextCursor: null })))
  vi.stubGlobal('fetch', fetch)
  render(<PrinterRepairManagement />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry owner email' }))
  expect(await screen.findByText('Accepted by the mail provider. Inbox delivery is not confirmed.')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Retry owner email' })).not.toBeInTheDocument()
  expect(JSON.parse(fetch.mock.calls.find(([, options]) => options.method === 'POST')[1].body)).toEqual({ action: 'retry_owner_email', requestId: row().requestId })
})
it.each(['uncertain', 'sending', 'accepted', 'not_recorded'])('does not offer an unsafe resend for %s', async status => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ requests: [row({ status, attempts: 1, canRetry: false })], nextCursor: null }))))
  render(<PrinterRepairManagement />)
  await screen.findByRole('button', { name: 'View request' })
  expect(screen.queryByRole('button', { name: 'Retry owner email' })).not.toBeInTheDocument()
})
it('keeps retry errors visible and requires a refresh after a lost response', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    if(options?.method === 'POST') throw Error('Synthetic response lost. Refresh before retrying.')
    return new Response(JSON.stringify({ requests: [row({ status: 'failed', attempts: 1, canRetry: true })], nextCursor: null }))
  }))
  render(<PrinterRepairManagement />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry owner email' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic response lost.')
  expect(screen.queryByRole('button', { name: 'Retry owner email' })).not.toBeInTheDocument()
})
