// The public print entry: the question, drop target and paste-link are on screen immediately; nothing is fetched or previewed
// until the person acts; unsafe links/files are refused with a reason; existing quoting/retry behaviour is untouched.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const state = vi.hoisted(() => ({ user: { id: 'buyer' }, scene: { fake: true }, generate: null, setBuffers: null }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: state.user, isLoaded: true }), SignInButton: ({ children }) => <span>{children}</span> }))
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="viewer">3D viewer</div> }))
vi.mock('@/utils/store', () => {
  const store = { scene: null, geometryMetrics: null, setFileName: vi.fn(), setBuffers: vi.fn(), generateScene: vi.fn(async () => { store.scene = state.scene; store.geometryMetrics = { dimensionsCm: { length: 1, width: 2, height: 3 } } }) }
  return { default: { getState: () => store } }
})
import GuidedPrintRequest from '@/components/PrintRequest/GuidedPrintRequest'
import useStore from '@/utils/store'

const ok = body => ({ ok: true, status: 200, json: async () => body })
const asciiStl = 'solid cube\n facet normal 0 0 1\n  outer loop\n   vertex 0 0 0\n   vertex 1 0 0\n   vertex 0 1 0\n  endloop\n endfacet\nendsolid cube\n'
const stl = (name = 'cube.stl') => new File([asciiStl], name)
const fileInput = () => screen.getByLabelText('Attach a model (optional)')
const posts = () => global.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
const apiFor = ({ uploads = true } = {}) => vi.fn(async (url, init) => {
  if (url === '/api/custom-print/guided') return init?.method === 'POST' ? ok({ requestId: 'guided-fixture' }) : ok({ uploadsAvailable: uploads })
  if (url === '/api/fabrication/assets') return ok({ assetId: 'asset-1' })
  return ok({ colours: [] })
})
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); state.user = { id: 'buyer' }; const store = useStore.getState(); store.scene = null; global.fetch = apiFor() })
afterEach(cleanup)

describe('the entry shows everything needed at once', () => {
  it('asks the question and offers drop and paste before any click, with no heavy viewer, iframe or remote request', async () => {
    render(<GuidedPrintRequest />)
    expect(screen.getByRole('heading', { name: /What would you like printed\?/ })).toBeVisible()
    expect(screen.getByLabelText('Describe what you need')).toBeVisible()
    expect(fileInput()).toBeInTheDocument()
    expect(screen.getByText(/Drop a model file here/)).toBeVisible()
    expect(screen.getByLabelText(/Model reference link/)).toBeVisible()
    expect(screen.queryByTestId('viewer')).toBeNull()
    expect(document.querySelector('iframe')).toBeNull()
    await screen.findByText(/Checking private uploads|Private uploads/i).catch(() => {})
    expect(global.fetch.mock.calls.every(([url]) => String(url).startsWith('/api/'))).toBe(true)          // only same-site APIs, never the linked site
  })
  it('works from the keyboard in a sensible order and every action has a 44px target', async () => {
    const user = userEvent.setup()
    render(<GuidedPrintRequest />)
    screen.getByLabelText('Describe what you need').focus()
    await user.tab()                                                                                     // request-type radios (one tab stop)
    expect(screen.getByLabelText('I have a model or a link')).toHaveFocus()
    await user.tab()
    expect(fileInput()).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText(/Model reference link/)).toHaveFocus()
    await user.type(screen.getByLabelText(/Model reference link/), 'https://makerworld.com/en/models/1')
    const card = await screen.findByTestId('link-card')
    for (const control of within(card).getAllByRole('button').concat(within(card).getAllByRole('link'))) expect(control.className).toMatch(/min-h-\[44px\]/)
  })
})

describe('paste a link', () => {
  it('shows a safe link card with the host only, no title/price/stock claim, and opens only on request', async () => {
    render(<GuidedPrintRequest />)
    fireEvent.change(screen.getByLabelText(/Model reference link/), { target: { value: 'https://www.makerworld.com/en/models/99-owl' } })
    const card = await screen.findByTestId('link-card')
    expect(card).toHaveTextContent('MakerWorld · makerworld.com')
    expect(card).toHaveTextContent(/FIT has not opened this page, so no title or picture is shown/)
    expect(card).toHaveTextContent('Model link ready for review'); expect(card.textContent).not.toMatch(/saved/i)
    const open = within(card).getByRole('link', { name: /Open the link in a new tab/ })
    expect(open).toHaveAttribute('target', '_blank'); expect(open).toHaveAttribute('rel', 'noopener noreferrer')
    expect(document.querySelector('iframe')).toBeNull()
    expect(global.fetch.mock.calls.some(([url]) => String(url).includes('makerworld'))).toBe(false)
    fireEvent.click(within(card).getByRole('button', { name: 'Remove link' }))
    expect(screen.queryByTestId('link-card')).toBeNull(); expect(screen.getByLabelText(/Model reference link/)).toHaveValue('')
  })
  it.each(['javascript:alert(1)', 'http://makerworld.com/x', 'https://user:pw@makerworld.com/x', 'https://127.0.0.1/x', 'https://localhost/x', 'file:///etc/passwd', 'not a link'])('refuses %s with a reason and blocks sending', async value => {
    render(<GuidedPrintRequest />)
    fireEvent.change(screen.getByLabelText('Describe what you need'), { target: { value: 'A holder' } })
    fireEvent.change(screen.getByLabelText(/Model reference link/), { target: { value } })
    expect((await screen.findAllByRole('alert'))[0].textContent.length).toBeGreaterThan(10)
    expect(screen.queryByTestId('link-card')).toBeNull()
    expect(screen.getByRole('button', { name: 'Send enquiry for a quote' })).toBeDisabled()
    expect(posts()).toHaveLength(0)
  })
  it('a valid link is sent in the brief exactly as the server validator expects, with no fetch of the link', async () => {
    render(<GuidedPrintRequest />)
    fireEvent.change(screen.getByLabelText('Describe what you need'), { target: { value: 'An owl' } })
    fireEvent.change(screen.getByLabelText(/Model reference link/), { target: { value: 'https://makerworld.com/en/models/99' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send enquiry for a quote' }))
    await screen.findByText('Your print enquiry is saved')
    expect(JSON.parse(posts()[0][1].body).brief.sourceUrl).toBe('https://makerworld.com/en/models/99')
    expect(global.fetch.mock.calls.some(([url]) => String(url).includes('makerworld'))).toBe(false)
  })
})

describe('drop or choose a file', () => {
  it('a valid STL becomes a file card; the 3D viewer waits for the Preview button', async () => {
    render(<GuidedPrintRequest />)
    fireEvent.change(fileInput(), { target: { files: [stl('desk-hook.stl')] } })
    const card = await screen.findByTestId('file-card')
    expect(card).toHaveTextContent('desk-hook.stl'); expect(card).toHaveTextContent(/STL ASCII/); expect(card).toHaveTextContent(/Nothing is uploaded until you send the enquiry/)
    expect(useStore.getState().generateScene).not.toHaveBeenCalled(); expect(screen.queryByTestId('viewer')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Preview in 3D/ }))
    expect(await screen.findByTestId('viewer')).toBeInTheDocument()
    expect(useStore.getState().generateScene).toHaveBeenCalledTimes(1)
    expect(posts()).toHaveLength(0)
  })
  it('a dropped file is handled like a chosen one; two dropped files are refused', async () => {
    render(<GuidedPrintRequest />)
    const zone = screen.getByText(/Drop a model file here/).closest('label')
    fireEvent.drop(zone, { dataTransfer: { files: [stl('a.stl'), stl('b.stl')] } })
    expect(await screen.findByText('Drop one model at a time.')).toBeVisible(); expect(screen.queryByTestId('file-card')).toBeNull()
    fireEvent.drop(zone, { dataTransfer: { files: [stl('one.stl')] } })
    expect(await screen.findByTestId('file-card')).toHaveTextContent('one.stl')
    expect(screen.queryByText('Drop one model at a time.')).toBeNull()
  })
  it.each([
    ['an empty file', new File([], 'a.stl'), /empty/], ['G-code', new File(['G28'], 'a.gcode'), /machine instructions/], ['STEP', new File(['x'], 'a.step'), /not supported/],
    ['a ZIP renamed to .stl', new File(['PK\x03\x04zz'], 'a.stl'), /compressed archive/], ['an executable renamed to .obj', new File(['MZ\x90'], 'a.obj'), /not a OBJ model/],
  ])('refuses %s with a reason and uploads nothing', async (_name, f, message) => {
    render(<GuidedPrintRequest />)
    fireEvent.change(fileInput(), { target: { files: [f] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByTestId('file-card')).toBeNull(); expect(posts()).toHaveLength(0)
  })
  it('refuses an oversize file with the size shown', async () => {
    render(<GuidedPrintRequest />)
    const big = new File([asciiStl], 'big.stl'); Object.defineProperty(big, 'size', { value: 3 * 1024 * 1024 + 1 })
    fireEvent.change(fileInput(), { target: { files: [big] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(/up to 3\.00 MB/)
  })
  it('a rejected file after a good one clears the good one (no stale attachment is sent)', async () => {
    render(<GuidedPrintRequest />)
    fireEvent.change(fileInput(), { target: { files: [stl()] } }); await screen.findByTestId('file-card')
    fireEvent.change(fileInput(), { target: { files: [new File(['G28'], 'x.gcode')] } })
    await screen.findByRole('alert'); expect(screen.queryByTestId('file-card')).toBeNull()
    fireEvent.change(screen.getByLabelText('Describe what you need'), { target: { value: 'A holder' } })
    fireEvent.click(screen.getByLabelText('I need help finding or making a model'))                       // description-only is the design-help request
    fireEvent.click(screen.getByRole('button', { name: 'Send enquiry for a quote' })); await screen.findByText('Your print enquiry is saved')
    expect(global.fetch.mock.calls.some(([url]) => url === '/api/fabrication/assets')).toBe(false)
    expect(JSON.parse(posts()[0][1].body).assetId).toBeNull()
  })
  it('uploads through the existing asset route only on send, then attaches the returned id', async () => {
    render(<GuidedPrintRequest />)
    await waitFor(() => expect(screen.queryByText(/Checking private uploads/)).toBeNull())
    fireEvent.change(fileInput(), { target: { files: [stl()] } }); await screen.findByTestId('file-card')
    expect(global.fetch.mock.calls.some(([url]) => url === '/api/fabrication/assets')).toBe(false)
    fireEvent.change(screen.getByLabelText('Describe what you need'), { target: { value: 'A hook' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send enquiry for a quote' })); await screen.findByText('Your print enquiry is saved')
    const assetCall = global.fetch.mock.calls.find(([url]) => url === '/api/fabrication/assets')
    expect(assetCall[1].method).toBe('POST'); expect(assetCall[1].body).toBeInstanceOf(FormData)
    expect(JSON.parse(posts().find(([url]) => url === '/api/custom-print/guided')[1].body).assetId).toBe('asset-1')
  })
  it('an upload failure is shown, the enquiry is not sent, and Remove file lets the person continue with a link', async () => {
    global.fetch = vi.fn(async (url, init) => url === '/api/fabrication/assets' ? { ok: false, status: 500, json: async () => ({ error: 'Storage is busy.' }) } : url === '/api/custom-print/guided' ? (init?.method === 'POST' ? ok({ requestId: 'x' }) : ok({ uploadsAvailable: true })) : ok({ colours: [] }))
    render(<GuidedPrintRequest />)
    await waitFor(() => expect(screen.queryByText(/Checking private uploads/)).toBeNull())
    fireEvent.change(fileInput(), { target: { files: [stl()] } }); await screen.findByTestId('file-card')
    fireEvent.change(screen.getByLabelText('Describe what you need'), { target: { value: 'A hook' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send enquiry for a quote' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage is busy.')
    expect(global.fetch.mock.calls.some(([url, init]) => url === '/api/custom-print/guided' && init?.method === 'POST')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Remove file' }))
    expect(screen.queryByTestId('file-card')).toBeNull()
  })
  it('with private uploads unavailable the page says so and a link or description still works', async () => {
    global.fetch = apiFor({ uploads: false })
    render(<GuidedPrintRequest />)
    expect(await screen.findByText(/Private uploads are unavailable/)).toBeVisible()
    fireEvent.change(screen.getByLabelText('Describe what you need'), { target: { value: 'A hook' } })
    fireEvent.change(screen.getByLabelText(/Model reference link/), { target: { value: 'https://makerworld.com/en/models/5' } })
    expect(screen.getByRole('button', { name: 'Send enquiry for a quote' })).toBeEnabled()
  })
})

describe('no price, printability or stock claim is invented', () => {
  it('never shows a price, "will print", "in stock" or "guaranteed" wording around a file or a link', async () => {
    render(<GuidedPrintRequest />)
    fireEvent.change(fileInput(), { target: { files: [stl()] } }); await screen.findByTestId('file-card')
    fireEvent.change(screen.getByLabelText(/Model reference link/), { target: { value: 'https://makerworld.com/en/models/9' } })
    const text = screen.getByTestId('model-quickstart').textContent
    expect(text).not.toMatch(/\$\s?\d|S\$|SGD|in stock|available now|guarantee|will print|can be printed\b(?! before)/i)
    const note = screen.getByTestId('review-note').textContent
    expect(note).toMatch(/licence/); expect(note).toMatch(/not permission to print it for sale/); expect(note).toMatch(/not an order, a price or a print start/)
  })
})
