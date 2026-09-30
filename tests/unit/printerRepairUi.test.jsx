import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true, user: { id: 'demo-user' } }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => auth, SignInButton: ({ children }) => children }))
import PrinterRepairFlow from '@/components/Services/PrinterRepairFlow'
import { repairFixture } from '../fixtures/printerRepair'
const id = '56e1fe9c-33e5-4ae3-8e70-dbc6b0c97b34'
const receipt = payload => ({ request: { requestId: id, status: 'assessment_requested', brief: payload.brief, photoCount: payload.photoAssetIds.length } })
let calls
beforeEach(() => {
  calls = []; sessionStorage.clear(); Object.assign(auth, { isLoaded: true, isSignedIn: true, user: { id: 'demo-user' } })
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    calls.push({ url, options })
    if (url.endsWith('/config')) return new Response(JSON.stringify({ uploadsAvailable: true }), { status: 200 })
    if (url === '/api/fabrication/assets') return new Response(JSON.stringify({ assetId: 'c4cda36f-cfd0-45e0-8518-03b9b9321ba5', kind: 'image' }), { status: 201 })
    return new Response(JSON.stringify(receipt(JSON.parse(options.body))), { status: 201 })
  }))
  URL.createObjectURL = vi.fn(() => 'blob:fixture-photo'); URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function advance(user = userEvent.setup()) {
  await user.type(screen.getByLabelText('Printer brand'), repairFixture.brief.brand)
  await user.type(screen.getByLabelText('Printer model'), repairFixture.brief.model)
  await user.selectOptions(screen.getByLabelText('What needs attention?'), repairFixture.brief.issue)
  await user.type(screen.getByLabelText('What happens when you use the printer?'), repairFixture.brief.details)
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByLabelText(/Photos Optional/)
  return user
}
async function contact(user, audience = 'individual') {
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await user.type(screen.getByLabelText('Your name'), 'Demo Customer')
  await user.type(screen.getByLabelText('Email'), 'customer@example.invalid')
  await user.selectOptions(screen.getByLabelText('Who is the printer for?'), audience)
}
describe('repair request customer interaction', () => {
  it('focuses an accessible error summary and preserves edits when moving back', async () => {
    render(<PrinterRepairFlow />); const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Check these details')
    expect(screen.getByLabelText('Printer brand')).toHaveAttribute('aria-invalid', 'true')
    await advance(user); await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText('Printer model')).toHaveValue('A1')
    expect(calls.some(call => call.options.method === 'POST')).toBe(false)
  })
  it.each(['individual', 'school', 'company', 'public_sector'])('sends an assessment-only request for %s', async audience => {
    render(<PrinterRepairFlow />); const user = await advance(); await contact(user, audience)
    await user.click(screen.getByRole('button', { name: 'Send assessment request' }))
    expect(await screen.findByRole('heading', { name: 'Your request has been received.' })).toBeVisible()
    const submission = JSON.parse(calls.find(call => call.url === '/api/printer-repair').options.body)
    expect(submission.brief.audience).toBe(audience); expect(submission.brief.handover).toBe('discuss_with_fit')
    expect(submission).not.toHaveProperty('price'); expect(screen.getByText(/preferred date has not been booked/)).toBeVisible()
    expect(sessionStorage.length).toBe(0)
  })
  it('checks file type/size/count, previews and removes photos, and uploads privately only on send', async () => {
    render(<PrinterRepairFlow />); const user = await advance()
    await user.upload(screen.getByLabelText(/Photos Optional/), new File(['photo'], 'printer.jpg', { type: 'image/jpeg' }))
    expect(screen.getByRole('img', { name: 'Preview of printer.jpg' })).toBeVisible()
    expect(calls.some(call => call.url === '/api/fabrication/assets')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Remove printer.jpg' })); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture-photo')
    fireEvent.change(screen.getByLabelText(/Photos Optional/), { target: { files: [new File(['svg'], 'payload.svg', { type: 'image/svg+xml' })] } })
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a JPEG')
    fireEvent.change(screen.getByLabelText(/Photos Optional/), { target: { files: Array.from({ length: 4 }, (_, i) => new File(['photo'], `${i}.jpg`, { type: 'image/jpeg' })) } })
    expect(screen.getByRole('alert')).toHaveTextContent('up to three')
    await user.upload(screen.getByLabelText(/Photos Optional/), new File(['photo'], 'printer.jpg', { type: 'image/jpeg' }))
    await contact(user); await user.click(screen.getByRole('button', { name: 'Send assessment request' })); await screen.findByRole('heading', { name: 'Your request has been received.' })
    expect(calls.filter(call => call.url === '/api/fabrication/assets')).toHaveLength(1)
    expect(JSON.parse(calls.find(call => call.url === '/api/printer-repair').options.body).photoAssetIds).toHaveLength(1)
  })
  it('retains an immutable request ID and uploaded assets after a lost response', async () => {
    render(<PrinterRepairFlow />); const user = await advance()
    await user.upload(screen.getByLabelText(/Photos Optional/), new File(['photo'], 'printer.jpg', { type: 'image/jpeg' }))
    await contact(user)
    const fetch = globalThis.fetch.getMockImplementation(); let first = true
    globalThis.fetch.mockImplementation(async (url, options) => { if (url === '/api/printer-repair' && first) { first = false; calls.push({ url, options }); throw new TypeError('Connection lost') }; return fetch(url, options) })
    await user.click(screen.getByRole('button', { name: 'Send assessment request' }))
    expect(await screen.findByRole('button', { name: 'Retry same request' })).toBeEnabled()
    expect(screen.getByLabelText('Your name')).toBeDisabled(); expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(sessionStorage.length).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Retry same request' })); await screen.findByRole('heading', { name: 'Your request has been received.' })
    const attempts = calls.filter(call => call.url === '/api/printer-repair')
    expect(attempts).toHaveLength(2); expect(attempts[0].options.body).toBe(attempts[1].options.body)
    expect(calls.filter(call => call.url === '/api/fabrication/assets')).toHaveLength(1)
  })
  it('restores an uncertain attempt after reload and recovers without posting a duplicate', async () => {
    sessionStorage.setItem('fit.printer-repair.pending.demo-user', JSON.stringify(repairFixture))
    globalThis.fetch.mockImplementation(async url => { calls.push({ url }); return new Response(JSON.stringify(url.endsWith('/config') ? { uploadsAvailable: true } : receipt(repairFixture)), { status: 200 }) })
    render(<PrinterRepairFlow />); await screen.findByRole('button', { name: 'Check request status' })
    await userEvent.click(screen.getByRole('button', { name: 'Check request status' })); await screen.findByRole('heading', { name: 'Your request has been received.' })
    expect(calls.every(call => !call.options?.method)).toBe(true); expect(sessionStorage.length).toBe(0)
  })
  it('keeps the original attempt after a 404 recovery so a safe retry remains available', async () => {
    sessionStorage.setItem('fit.printer-repair.pending.demo-user', JSON.stringify(repairFixture))
    globalThis.fetch.mockImplementation(async url => new Response(JSON.stringify(url.endsWith('/config') ? { uploadsAvailable: true } : { error: 'No saved request' }), { status: url.endsWith('/config') ? 200 : 404 }))
    render(<PrinterRepairFlow />); await userEvent.click(await screen.findByRole('button', { name: 'Check request status' }))
    expect(await screen.findByText('No saved request was found. Retry the same request below.')).toBeVisible(); expect(screen.getByRole('button', { name: 'Retry same request' })).toBeEnabled()
  })
  it('allows correction after a definite first-attempt validation rejection', async () => {
    render(<PrinterRepairFlow />); const user = await advance(); await contact(user)
    const fetch = globalThis.fetch.getMockImplementation()
    globalThis.fetch.mockImplementation((url, options) => url === '/api/printer-repair' ? Promise.resolve(new Response(JSON.stringify({ error: 'Correct these details.' }), { status: 400 })) : fetch(url, options))
    await user.click(screen.getByRole('button', { name: 'Send assessment request' })); await screen.findByText(/You can correct your draft/)
    expect(screen.getByLabelText('Email')).toBeEnabled(); expect(sessionStorage.length).toBe(0)
  })
  it('cancels an unsent draft with confirmation and makes no request or upload', async () => {
    render(<PrinterRepairFlow />); const user = userEvent.setup(); await user.type(screen.getByLabelText('Printer brand'), 'Unsure')
    await user.click(screen.getByRole('button', { name: 'Cancel this draft' })); await user.click(screen.getByRole('button', { name: 'Keep editing' })); expect(screen.getByLabelText('Printer brand')).toHaveValue('Unsure')
    await user.click(screen.getByRole('button', { name: 'Cancel this draft' })); await user.click(screen.getByRole('button', { name: 'Clear draft' }))
    expect(screen.getByLabelText('Printer brand')).toHaveValue(''); expect(calls.some(call => call.options.method === 'POST')).toBe(false)
  })
  it('requires sign-in to send but allows anonymous preparation', async () => {
    auth.isSignedIn = false; auth.user = null; render(<PrinterRepairFlow />)
    const user = await advance(); await contact(user)
    expect(screen.getByRole('button', { name: 'Send assessment request' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeVisible()
    expect(calls.some(call => call.options.method === 'POST')).toBe(false)
  })
  it('handles unavailable uploads without blocking a photo-free request', async () => {
    const fetch = globalThis.fetch.getMockImplementation(); globalThis.fetch.mockImplementation((url, options) => url.endsWith('/config') ? Promise.resolve(new Response(JSON.stringify({ uploadsAvailable: false }))) : fetch(url, options))
    render(<PrinterRepairFlow />); const user = userEvent.setup()
    await user.type(screen.getByLabelText('Printer brand'), 'Unsure'); await user.type(screen.getByLabelText('Printer model'), 'Unsure'); await user.selectOptions(screen.getByLabelText('What needs attention?'), 'other'); await user.type(screen.getByLabelText('What happens when you use the printer?'), 'The printer is not printing.'); await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/Photo uploads are currently unavailable/)).toBeVisible(); await contact(user); await user.click(screen.getByRole('button', { name: 'Send assessment request' })); await screen.findByRole('heading', { name: 'Your request has been received.' })
  })
  it('withdraws an assessment only after explicit confirmation and permits a safe retry', async () => {
    render(<PrinterRepairFlow />); const user = await advance(); await contact(user); await user.click(screen.getByRole('button', { name: 'Send assessment request' })); await screen.findByRole('heading', { name: 'Your request has been received.' })
    globalThis.fetch.mockImplementation(async (_url, options) => new Response(JSON.stringify({ request: { ...receipt(repairFixture).request, status: 'withdrawn' } }), { status: options.method === 'PATCH' ? 200 : 400 }))
    await user.click(screen.getByRole('button', { name: 'Withdraw request' })); await user.click(screen.getByRole('button', { name: 'Keep request' })); expect(screen.getByRole('button', { name: 'Withdraw request' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Withdraw request' })); await user.click(screen.getByRole('button', { name: 'Yes, withdraw request' })); expect(await screen.findByRole('heading', { name: 'Your request is closed.' })).toBeVisible()
  })
  it('clears private request state when the signed-in account changes', async () => {
    sessionStorage.setItem('fit.printer-repair.pending.demo-user', JSON.stringify(repairFixture)); const view = render(<PrinterRepairFlow />)
    await screen.findByRole('button', { name: 'Retry same request' }); auth.user = { id: 'different-user' }; view.rerender(<PrinterRepairFlow />)
    await waitFor(() => expect(screen.getByLabelText('Printer brand')).toHaveValue('')); expect(screen.queryByRole('button', { name: 'Retry same request' })).not.toBeInTheDocument()
  })
  it('reopens a saved assessment privately from its reference link', async () => {
    window.history.replaceState(null, '', `/?request=${id}`)
    globalThis.fetch.mockImplementation(async url => new Response(JSON.stringify(url.endsWith('/config') ? { uploadsAvailable: true } : receipt(repairFixture))))
    render(<PrinterRepairFlow />)
    expect(await screen.findByRole('heading', { name: 'Your request has been received.' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Withdraw request' })).toBeVisible()
  })
  it('offers sign-in immediately on a private saved-reference link', async () => {
    window.history.replaceState(null, '', `/?request=${id}`); auth.isSignedIn = false; auth.user = null; render(<PrinterRepairFlow />)
    expect(await screen.findByRole('button', { name: 'Sign in to view request' })).toBeVisible()
    expect(calls.some(call => call.url === `/api/printer-repair/${id}`)).toBe(false)
  })
  it('stops an interrupted upload while preserving a draft and sending no assessment', async () => {
    render(<PrinterRepairFlow />); const user = await advance()
    await user.upload(screen.getByLabelText(/Photos Optional/), new File(['photo'], 'printer.jpg', { type: 'image/jpeg' })); await contact(user)
    const fetch = globalThis.fetch.getMockImplementation()
    globalThis.fetch.mockImplementation((url, options) => url === '/api/fabrication/assets' ? new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')))) : fetch(url, options))
    await user.click(screen.getByRole('button', { name: 'Send assessment request' })); await user.click(await screen.findByRole('button', { name: 'Stop upload' }))
    expect(await screen.findByText(/Upload stopped. Your draft is still here/)).toBeVisible(); expect(screen.getByLabelText('Your name')).toHaveValue('Demo Customer')
    expect(calls.some(call => call.url === '/api/printer-repair')).toBe(false)
  })
  it('ignores repeated submit events while one send is in flight', async () => {
    render(<PrinterRepairFlow />); const user = await advance(); await contact(user)
    let resolveSend
    const fetch = globalThis.fetch.getMockImplementation()
    globalThis.fetch.mockImplementation((url, options) => { if (url !== '/api/printer-repair') return fetch(url, options); calls.push({ url, options }); return new Promise(resolve => { resolveSend = resolve }) })
    fireEvent.submit(screen.getByRole('button', { name: 'Send assessment request' }).closest('form')); fireEvent.submit(screen.getByRole('button', { name: 'Please wait…' }).closest('form'))
    expect(calls.filter(call => call.url === '/api/printer-repair')).toHaveLength(1)
    resolveSend(new Response(JSON.stringify(receipt(repairFixture)), { status: 201 })); await screen.findByRole('heading', { name: 'Your request has been received.' })
  })
  it('does not submit when continuing back through a completed contact draft', async () => {
    render(<PrinterRepairFlow />); const user = await advance(); await contact(user)
    await user.click(screen.getByRole('button', { name: 'Back' })); await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByRole('button', { name: 'Continue' })); await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('button', { name: 'Send assessment request' })).toBeEnabled(); expect(calls.some(call => call.url === '/api/printer-repair')).toBe(false)
  })
})
