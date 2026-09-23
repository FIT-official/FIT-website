import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import FabricationRequestFlow from '@/components/Fabrication/FabricationRequestFlow'
import FabricationCatalogEditor from '@/components/Fabrication/FabricationCatalogEditor'
import FabricationJobs from '@/components/Fabrication/FabricationJobs'
import { calculateFabricationEstimate } from '@/lib/fabrication/pricing'
import { validateFabricationCatalog } from '@/lib/fabrication/validate'

const state = vi.hoisted(() => ({ user: null, params: new URLSearchParams('creator=studio&offer=tag') }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: state.user, isLoaded: true }), SignInButton: ({ children }) => children }))
vi.mock('next/navigation', () => ({ useSearchParams: () => state.params }))
vi.mock('next/link', () => ({ default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/components/Fabrication/PersonalizationEditor', () => ({ default: ({ value, onChange, readOnly, allowRegionEdit }) => <div>
  <label>Personalization text<input value={value.text || ''} readOnly={readOnly} onChange={event => onChange({ ...value, text: event.target.value })} /></label>
  {allowRegionEdit && !readOnly && <button onClick={() => onChange({ ...value, text: 'Revised name', region: { x: .1, y: .2, width: .7, height: .3 } })}>Set provider region</button>}
</div> }))

const region = { x: .2, y: .3, width: .6, height: .3 }
const catalogue = () => ({ enabled: true, offers: [{ id: 'tag', kind: 'name_tag', name: 'Personalised tag', description: 'Laser-marked acrylic.', enabled: true, leadTimeDays: 5,
  materials: [{ id: 'acrylic-3', name: 'Acrylic', thicknessMm: 3, pricePerCm2: .2, pricePerCm3: 0, setupFee: 5, perItemFee: 1, minimumCharge: 10, maxWidthMm: 200, maxHeightMm: 200, maxDepthMm: 3 }],
  template: { assetId: 'template-1', region, fontFamily: 'sans', textColor: '#182c32' },
}] })
const publicCatalog = () => { const catalog = catalogue(); catalog.offers[0].template.imageUrl = '/tag.png'; return { ...catalog, uploadsAvailable: true, creator: { name: 'Studio', userId: 'studio' } } }
const response = (body, status = 200) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body })
const estimate = input => calculateFabricationEstimate(catalogue(), input).value
let calls
beforeEach(() => {
  state.user = null; state.params = new URLSearchParams('creator=studio&offer=tag'); calls = []
  global.fetch = vi.fn((url, options = {}) => {
    calls.push({ url, ...options })
    if (url.includes('/creators/')) return response(publicCatalog())
    if (url === '/api/fabrication/estimate') { const { creatorId: _creator, ...input } = JSON.parse(options.body); const result = calculateFabricationEstimate(catalogue(), input); return response(result.ok ? { estimate: result.value } : { error: result.error }, result.ok ? 200 : 400) }
    if (url === '/api/user/fabrication-service') return response({ catalog: catalogue(), canManage: true, planId: 'pro', uploadsAvailable: true })
    return response({ error: 'Unexpected route' }, 404)
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('fabrication customer flow', () => {
  it.each([false, undefined])('keeps a text-only request usable with disabled attachment controls (%s)', async uploadsAvailable => {
    state.user = { id: 'buyer' }
    const catalog = { ...publicCatalog(), uploadsAvailable }
    delete catalog.offers[0].template
    const original = global.fetch
    global.fetch = vi.fn((url, options) => {
      if (url.includes('/creators/')) return response(catalog)
      if (url === '/api/fabrication/requests') { calls.push({ url, ...options }); return response({ request: { requestId: 'text-request' } }) }
      return original(url, options)
    })
    render(<FabricationRequestFlow />)
    await screen.findByText('S$10.80')
    expect(screen.getByText(/Image and reference uploads are not available yet/)).toBeInTheDocument()
    const imageInput = screen.getByLabelText(/Add your image/)
    const referenceInput = screen.getByLabelText(/Production or reference file/)
    expect(imageInput).toBeDisabled(); expect(referenceInput).toBeDisabled()
    // Even a synthetic change cannot queue an attachment while disabled.
    fireEvent.change(imageInput, { target: { files: [new File(['photo'], 'photo.png', { type: 'image/png' })] } })
    fireEvent.change(referenceInput, { target: { files: [new File(['pdf'], 'design.pdf', { type: 'application/pdf' })] } })
    fireEvent.change(screen.getByLabelText(/Anything else/), { target: { value: 'Please engrave Maya in plain text.' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send to provider' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Send to provider' }))
    await screen.findByText('Your idea is with the provider.')
    const request = JSON.parse(calls.find(call => call.url === '/api/fabrication/requests').body)
    expect(request.customerNote).toBe('Please engrave Maya in plain text.')
    expect(request).not.toHaveProperty('imageAssetId'); expect(request).not.toHaveProperty('referenceAssetId')
    expect(calls.some(call => call.url === '/api/fabrication/assets')).toBe(false)
  })
  it('shows an authoritative estimate before sign-in and updates size without sending prices', async () => {
    render(<FabricationRequestFlow />)
    await screen.findByText('S$10.80')
    expect(screen.getByRole('button', { name: 'Sign in to send request' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Width (mm)'), { target: { value: '100' } })
    await screen.findByText('S$12.00')
    const sent = JSON.parse(calls.filter(call => call.url === '/api/fabrication/estimate').at(-1).body)
    expect(sent).toMatchObject({ creatorId: 'studio', widthMm: 100, materialId: 'acrylic-3', quantity: 1 })
    expect(sent).not.toHaveProperty('price'); expect(sent).not.toHaveProperty('depthMm')
  })
  it('does not send an outdated estimate after invalid dimensions', async () => {
    render(<FabricationRequestFlow />)
    await screen.findByText('S$10.80')
    fireEvent.change(screen.getByLabelText('Width (mm)'), { target: { value: '999' } })
    await screen.findByRole('alert')
    expect(screen.queryByText('S$10.80')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in to send request' })).toBeDisabled()
  })
  it('keeps one request identity and freezes the draft after an uncertain submission', async () => {
    state.user = { id: 'buyer' }
    const original = global.fetch
    let attempts = 0
    global.fetch = vi.fn((url, options) => {
      if (url === '/api/fabrication/requests') { calls.push({ url, ...options }); attempts++; return attempts === 1 ? Promise.reject(new Error('Connection interrupted.')) : response({ request: { requestId: 'saved-1' } }) }
      return original(url, options)
    })
    render(<FabricationRequestFlow />)
    await screen.findByText('S$10.80')
    fireEvent.change(screen.getByLabelText('Personalization text'), { target: { value: 'Maya' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send to provider' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Send to provider' }))
    await screen.findByText(/Connection interrupted/)
    expect(screen.getByLabelText('Width (mm)')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry submitting request' }))
    await screen.findByText('Your idea is with the provider.')
    const requests = calls.filter(call => call.url === '/api/fabrication/requests').map(call => JSON.parse(call.body))
    expect(requests).toHaveLength(2); expect(requests[0]).toEqual(requests[1])
    expect(requests[0]).toMatchObject({ imageAssetId: 'template-1', personalization: { text: 'Maya', region, fontFamily: 'sans' } })
  })
  it('allows file replacement when an upload fails before request creation', async () => {
    state.user = { id: 'buyer' }
    URL.createObjectURL = vi.fn(() => 'blob:local-image')
    URL.revokeObjectURL = vi.fn()
    const original = global.fetch
    global.fetch = vi.fn((url, options) => url === '/api/fabrication/assets' ? response({ error: 'Image could not be decoded.' }, 400) : original(url, options))
    render(<FabricationRequestFlow />)
    await screen.findByText('S$10.80')
    fireEvent.change(screen.getByLabelText(/Add your image/), { target: { files: [new File(['bad'], 'photo.png', { type: 'image/png' })] } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send to provider' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Send to provider' }))
    await screen.findByText(/Image could not be decoded/)
    expect(screen.getByLabelText('Width (mm)')).toBeEnabled()
    expect(screen.getByLabelText(/Add your image/)).toBeEnabled()
    expect(calls.filter(call => call.url === '/api/fabrication/requests')).toHaveLength(0)
  })
})

describe('provider surfaces', () => {
  it.each([false, undefined])('disables template uploads while keeping catalogue prices editable (%s)', async uploadsAvailable => {
    const catalog = catalogue()
    delete catalog.offers[0].template
    global.fetch = vi.fn((url, options) => {
      calls.push({ url, ...options })
      return response({ catalog: options?.method === 'PUT' ? JSON.parse(options.body).catalog : catalog,
        canManage: true, planId: 'pro', uploadsAvailable })
    })
    render(<FabricationCatalogEditor />)
    const input = await screen.findByLabelText(/Upload template image/)
    expect(input).toBeDisabled()
    expect(screen.getByText(/Image uploads are not available yet/)).toBeInTheDocument()
    fireEvent.change(input, { target: { files: [new File(['photo'], 'photo.png', { type: 'image/png' })] } })
    const rate = screen.getByLabelText('S$ per item')
    expect(rate).toBeEnabled()
    fireEvent.change(rate, { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save services' }))
    await screen.findByText(/Services saved/)
    expect(JSON.parse(calls.find(call => call.method === 'PUT').body).catalog.offers[0].materials[0].perItemFee).toBe(4)
    expect(calls.some(call => call.url === '/api/fabrication/assets')).toBe(false)
  })
  it('saves a strict catalog wrapper without leaking signed image fields', async () => {
    global.fetch = vi.fn((url, options) => { calls.push({ url, ...options }); return response({ catalog: publicCatalog(), canManage: true, planId: 'pro' }) })
    render(<FabricationCatalogEditor />)
    fireEvent.change(await screen.findByLabelText('Service name'), { target: { value: 'Engraved tag' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save services' }))
    await screen.findByText(/Services saved/)
    const payload = JSON.parse(calls.find(call => call.method === 'PUT').body)
    expect(validateFabricationCatalog(payload.catalog).ok).toBe(true)
    expect(payload.catalog.offers[0].template).not.toHaveProperty('imageUrl')
  })
  it('sends only the edited offer and keeps unchanged offers visible after saving', async () => {
    const catalog = publicCatalog()
    catalog.offers.push({ ...catalog.offers[0], id: 'second-tag', name: 'Second tag' })
    global.fetch = vi.fn((url, options) => {
      calls.push({ url, ...options })
      return response({ catalog: options?.method === 'PUT' ? JSON.parse(options.body).catalog : catalog, canManage: true, planId: 'pro' })
    })
    render(<FabricationCatalogEditor />)
    await screen.findByDisplayValue('Second tag')
    fireEvent.change(screen.getAllByLabelText('Service name')[0], { target: { value: 'Engraved tag' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save services' }))
    await screen.findByText(/Services saved/)
    expect(JSON.parse(calls.find(call => call.method === 'PUT').body).catalog.offers.map(offer => offer.id)).toEqual(['tag'])
    expect(screen.getByDisplayValue('Second tag')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'First services' })).toBeEnabled()
  })
  it('does not send deletions for discarded unsaved drafts', async () => {
    render(<FabricationCatalogEditor />)
    await screen.findByRole('button', { name: 'Save services' })
    fireEvent.click(screen.getByRole('button', { name: 'Add offer' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove offer' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'Save services' }))
    await screen.findByText(/Services saved/)
    const payload = JSON.parse(calls.find(call => call.method === 'PUT').body)
    expect(payload).not.toHaveProperty('removedOfferIds')
    expect(payload.catalog.offers).toEqual([])
  })
  it('keeps editing disabled for a downgraded account while linking existing jobs', async () => {
    global.fetch = vi.fn(() => response({ catalog: catalogue(), canManage: false, planId: 'standard' }))
    render(<FabricationCatalogEditor />)
    await screen.findByText('Custom services are included in Pro')
    expect(screen.getByRole('button', { name: 'Save services' })).toBeDisabled()
    expect(screen.getByRole('link', { name: /View service requests/ })).toHaveAttribute('href', '/dashboard/service-jobs')
  })
  it('updates the quote and chosen text region with the saved version', async () => {
    state.user = { id: 'provider' }
    const snapshot = estimate({ offerId: 'tag', materialId: 'acrylic-3', widthMm: 80, heightMm: 30, quantity: 1, personalization: { text: 'Maya', region, fontFamily: 'sans', textColor: '#182c32' } })
    const job = { requestId: 'job-1', status: 'submitted', createdAt: '2026-09-23T01:00:00Z', updatedAt: '2026-09-23T01:00:00Z', snapshot, personalization: snapshot.personalization, image: { imageUrl: '/tag.png' } }
    global.fetch = vi.fn((url, options) => { calls.push({ url, ...options }); return response(options?.method === 'PATCH' ? { request: { ...job, status: 'quoted', confirmedPrice: 15, updatedAt: '2026-09-23T02:00:00Z' } } : { requests: [job] }) })
    render(<FabricationJobs role="provider" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Review design & quote' }))
    fireEvent.click(screen.getByRole('button', { name: 'Set provider region' }))
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'quoted' } })
    fireEvent.change(screen.getByLabelText(/Confirmed total/), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save review' }))
    await screen.findByText('S$15.00')
    const patch = JSON.parse(calls.find(call => call.method === 'PATCH').body)
    expect(patch).toMatchObject({ expectedUpdatedAt: job.updatedAt, status: 'quoted', confirmedPrice: 15, personalization: { text: 'Revised name', region: { x: .1, y: .2, width: .7, height: .3 } } })
  })
})
