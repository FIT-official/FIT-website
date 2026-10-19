// Minimum details for a model-ready print quote request (file OR model link, quantity, size/scale; material/colour/notes optional),
// the separate design-help path, compact-page structure, and one concise review/licence statement. Synthetic: Clerk/fetch stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { quoteRequirements } from '../lib/customPrint/modelInput'

const state = vi.hoisted(() => ({ user: { id: 'buyer' } }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: state.user, isLoaded: true }), SignInButton: ({ children }) => <span>{children}</span> }))
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
vi.mock('next/dynamic', () => ({ default: () => () => <div>viewer</div> }))
vi.mock('@/utils/store', () => ({ default: { getState: () => ({ setFileName() {}, setBuffers() {}, generateScene: async () => {} }) } }))
import GuidedPrintRequest from '@/components/PrintRequest/GuidedPrintRequest'

const ok = body => ({ ok: true, status: 200, json: async () => body })
const STL = 'solid cube\n facet normal 0 0 1\n  outer loop\n   vertex 0 0 0\n   vertex 1 0 0\n   vertex 0 1 0\n  endloop\n endfacet\nendsolid cube\n'
const LINK = 'https://makerworld.com/en/models/321'
const posts = () => global.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
const send = () => screen.getByRole('button', { name: /Send enquiry for a quote/ })
const purpose = text => fireEvent.change(screen.getByLabelText('Describe what you need'), { target: { value: text } })
const link = value => fireEvent.change(screen.getByLabelText(/Model reference link/), { target: { value } })
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); state.user = { id: 'buyer' }; global.fetch = vi.fn(async (url, init) => url === '/api/custom-print/guided' ? (init?.method === 'POST' ? ok({ requestId: 'REQ-1' }) : ok({ uploadsAvailable: true })) : url === '/api/fabrication/assets' ? ok({ assetId: 'asset-9' }) : ok({ colours: [] })) })
afterEach(cleanup)

describe('quoteRequirements (pure)', () => {
  const good = { mode: 'model', purpose: 'A hook', link: LINK, hasFile: false, quantity: 1, sizeMode: 'original', size: '' }
  it('is ready with a link, a file, or both', () => {
    expect(quoteRequirements(good)).toEqual({ ready: true, missing: [] })
    expect(quoteRequirements({ ...good, link: '', hasFile: true }).ready).toBe(true)
    expect(quoteRequirements({ ...good, hasFile: true }).ready).toBe(true)
  })
  it.each([
    ['no file and no link', { link: '' }, /model file or a model link/], ['an unsafe link', { link: 'http://x.example/a' }, /fix or remove the model link/], ['no purpose', { purpose: '  ' }, /what you want printed/],
    ['zero copies', { quantity: 0 }, /how many copies/], ['fractional copies', { quantity: 1.5 }, /how many copies/], ['1001 copies', { quantity: 1001 }, /how many copies/],
    ['a size mode of help in model mode', { sizeMode: 'help' }, /choose the size/], ['longest side without a number', { sizeMode: 'longest', size: '' }, /choose the size/], ['longest side of zero', { sizeMode: 'longest', size: '0' }, /choose the size/],
  ])('is not ready with %s', (_n, change, message) => { const r = quoteRequirements({ ...good, ...change }); expect(r.ready).toBe(false); expect(r.missing.join(' ')).toMatch(message) })
  it('a valid longest side is accepted; optional fields are never required', () => { expect(quoteRequirements({ ...good, sizeMode: 'longest', size: '45' }).ready).toBe(true) })
  it('design-help mode needs only a description and a quantity', () => {
    expect(quoteRequirements({ ...good, mode: 'help', link: '', sizeMode: 'help' })).toEqual({ ready: true, missing: [] })
    expect(quoteRequirements({ ...good, mode: 'help', purpose: '' }).ready).toBe(false)
  })
})

describe('the form enforces them without extra clicks', () => {
  it('opens in model mode with original size and one copy, so a link or file plus a description is enough', async () => {
    render(<GuidedPrintRequest />)
    expect(screen.getByLabelText('I have a model or a link')).toBeChecked(); expect(screen.getByLabelText('How large should it be?')).toHaveValue('original'); expect(screen.getByLabelText('Number of copies')).toHaveValue(1)
    expect(send()).toBeDisabled(); expect(screen.getByTestId('send-needs')).toHaveTextContent(/say what you want printed; add a model file or a model link/)
    purpose('A hook'); link(LINK)
    expect(send()).toBeEnabled(); expect(screen.queryByTestId('send-needs')).toBeNull()
    fireEvent.click(send()); await screen.findByText('Your print enquiry is saved')
    const brief = JSON.parse(posts()[0][1].body).brief
    expect(brief).toMatchObject({ sourceUrl: LINK, sizeMode: 'original', quantity: 1, material: 'help' })
    expect(global.fetch.mock.calls.some(([url]) => String(url).includes('makerworld'))).toBe(false)
  })
  it('a file alone is enough, and bad quantity or a missing longest side blocks sending with the reason shown', async () => {
    render(<GuidedPrintRequest />)
    purpose('A hook'); fireEvent.change(screen.getByLabelText('Attach a model (optional)'), { target: { files: [new File([STL], 'hook.stl')] } }); await screen.findByTestId('file-card')
    expect(send()).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Number of copies'), { target: { value: '0' } }); expect(send()).toBeDisabled(); expect(screen.getByTestId('send-needs')).toHaveTextContent(/how many copies/)
    fireEvent.change(screen.getByLabelText('Number of copies'), { target: { value: '3' } }); expect(send()).toBeEnabled()
    fireEvent.change(screen.getByLabelText('How large should it be?'), { target: { value: 'longest' } }); expect(send()).toBeDisabled(); expect(screen.getByTestId('send-needs')).toHaveTextContent(/longest side/)
    fireEvent.change(screen.getByLabelText('Longest side'), { target: { value: '60' } }); expect(send()).toBeEnabled()
  })
  it('material, colour, category and notes stay optional and are tucked into one collapsed section', () => {
    render(<GuidedPrintRequest />)
    const more = screen.getByText(/More options: material, colour, category and notes/).closest('details')
    expect(more).not.toHaveAttribute('open'); expect(within(more).getByLabelText('Material preference')).toBeInTheDocument(); expect(within(more).getByLabelText(/Remarks/)).toBeInTheDocument()
    purpose('A hook'); link(LINK); expect(send()).toBeEnabled()
  })
  it('the design-help path is explicit, hides model/size inputs, sends no link or file, and is recorded as help finding a model', async () => {
    render(<GuidedPrintRequest />)
    purpose('Something to hold my router'); fireEvent.change(screen.getByLabelText('Attach a model (optional)'), { target: { files: [new File([STL], 'ignored.stl')] } }); await screen.findByTestId('file-card'); link(LINK)
    fireEvent.click(screen.getByLabelText('I need help finding or making a model'))
    expect(screen.getByTestId('help-note')).toHaveTextContent(/not a print quote/); expect(screen.queryByLabelText('Attach a model (optional)')).toBeNull(); expect(screen.queryByLabelText('How large should it be?')).toBeNull()
    expect(screen.getByText('Help finding a model')).toBeInTheDocument()
    expect(send()).toBeEnabled(); fireEvent.click(send()); await screen.findByText('Your print enquiry is saved')
    expect(global.fetch.mock.calls.some(([url]) => url === '/api/fabrication/assets')).toBe(false)
    const body = JSON.parse(posts()[0][1].body); expect(body.assetId).toBeNull(); expect(body.brief).toMatchObject({ sourceUrl: '', sizeMode: 'help' })
  })
  it('switching back to model mode restores what was typed', () => {
    render(<GuidedPrintRequest />)
    purpose('A hook'); link(LINK); fireEvent.click(screen.getByLabelText('I need help finding or making a model')); fireEvent.click(screen.getByLabelText('I have a model or a link'))
    expect(screen.getByLabelText(/Model reference link/)).toHaveValue(LINK); expect(screen.getByTestId('link-card')).toBeInTheDocument()
  })
  it('a held retry is not blocked by the requirement check (the brief was already frozen)', async () => {
    let first = true
    global.fetch = vi.fn(async (url, init) => { if (url === '/api/custom-print/guided' && init?.method === 'POST') { if (first) { first = false; throw new Error('offline') } return ok({ requestId: 'REQ-2' }) } return url === '/api/custom-print/guided' ? ok({ uploadsAvailable: true }) : ok({ colours: [] }) })
    render(<GuidedPrintRequest />); purpose('A hook'); link(LINK); fireEvent.click(send()); await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Retry the same enquiry' })); await screen.findByText('Your print enquiry is saved')
  })
})

describe('compact page and honest, non-repeated wording', () => {
  it('has a one-line hero, the question first, and the detailed-flow link only after the send button', () => {
    render(<GuidedPrintRequest />)
    const main = screen.getByRole('main'); const hero = main.querySelector('h1').nextElementSibling
    expect(hero.textContent.length).toBeLessThan(120); expect(hero.textContent).toMatch(/Add a model file or link, say how many and how big/)
    const order = [...main.querySelectorAll('h1, h2, a, button, input, select')]
    const idx = el => order.indexOf(el)
    const advanced = screen.getByRole('link', { name: /detailed print flow/ })
    expect(idx(advanced)).toBeGreaterThan(idx(send())); expect(idx(screen.getByLabelText('Describe what you need'))).toBeLessThan(idx(screen.getByLabelText('Attach a model (optional)')))
    expect(advanced).toHaveAttribute('href', '/prints/request?mode=advanced')
  })
  it('says the staff-review / licence / not-a-price point ONCE on the page and never "saved" before sending', () => {
    render(<GuidedPrintRequest />); purpose('A hook'); link(LINK)
    const text = screen.getByRole('main').textContent
    expect((text.match(/not an order, a price or a print start/g) || []).length).toBe(1)
    expect((text.match(/commercial|licence/gi) || []).length).toBeLessThanOrEqual(4)
    expect(text).not.toMatch(/Link saved|saved with your enquiry/i); expect(text).toMatch(/Model link ready for review/)
  })
  it('keeps the true 3 MB upload limit visible and does not offer larger files', () => {
    render(<GuidedPrintRequest />)
    expect(screen.getByText(/up to 3 MB/)).toBeVisible(); expect(document.querySelector('input[type=file]').getAttribute('accept')).toBe('.stl,.obj,.3mf')
  })
  it('model-entry controls keep 44px targets', async () => {
    render(<GuidedPrintRequest />); link(LINK)
    const card = await screen.findByTestId('link-card')
    for (const control of [...within(card).getAllByRole('button'), ...within(card).getAllByRole('link'), screen.getByLabelText('I have a model or a link').closest('label')]) expect(control.className).toMatch(/min-h-\[44px\]/)
  })
})
