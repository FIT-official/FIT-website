import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const state = vi.hoisted(() => ({ user: null, fetch: vi.fn() }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: state.user, isLoaded: true }), SignInButton: ({ children }) => children }))
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
// Next Image becomes a plain DOM image only inside this component test.
// eslint-disable-next-line @next/next/no-img-element
vi.mock('next/image', () => ({ default: ({ unoptimized, ...props }) => <img {...props} alt={props.alt} /> }))
import MakerTools from '@/components/MakerTools/MakerTools'
import { COLOURS } from '@/lib/makerTools/colours'
const ref = COLOURS[0]
const privateSpool = { id: 'spool-a', label: 'Alice private spool', brand: ref.brand, material: ref.material, referenceId: ref.id, hex: ref.hex, remainingGrams: 50, diameter: 1.75, format: 'spool' }
beforeEach(() => {
  state.user = null; vi.clearAllMocks(); vi.stubGlobal('fetch', state.fetch)
  state.fetch.mockImplementation(async url => ({ ok: true, json: async () => url.includes('catalogue') ? { offers: [] } : { revision: 1, spools: [privateSpool] } }))
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('offers working guest matching and validation without requesting private inventory', async () => {
  render(<MakerTools />)
  await screen.findByText(/Catalogue loaded/)
  expect(state.fetch.mock.calls.some(([url]) => url.includes('inventory'))).toBe(false)
  expect(screen.getByRole('heading', { name: 'From HEX to filament.' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Target HEX'), { target: { value: '#12345' } })
  expect(screen.getByRole('alert')).toHaveTextContent('3- or 6-digit')
  fireEvent.click(screen.getByRole('button', { name: /My filament/ }))
  expect(screen.getByRole('button', { name: 'Sign in to save filament' })).toBeInTheDocument()
})
it('calculates material and does not invent print time', async () => {
  render(<MakerTools />); await screen.findByText(/Catalogue loaded/)
  fireEvent.click(screen.getByRole('button', { name: /Material estimator/ }))
  expect(screen.getByText('110 g')).toBeVisible()
  expect(screen.getByText('No time estimate')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Copies'), { target: { value: '2' } })
  expect(screen.getByText('220 g')).toBeVisible()
})
it('uses matcher colour in the planner and requires meaningful grams', async () => {
  render(<MakerTools />); await screen.findByText(/Catalogue loaded/)
  fireEvent.click(screen.getByRole('button', { name: 'Use Bambu Green in planner' }))
  expect(screen.getByLabelText('Project colour 1')).toHaveValue(COLOURS.find(c => c.name === 'Bambu Green').id)
  fireEvent.change(screen.getByLabelText('Required grams for colour 1'), { target: { value: '100' } })
  expect(screen.getByText(/Plan for 1 × 1 kg pack/)).toBeVisible()
})
it('loads private inventory and preserves edits on conflicting save', async () => {
  state.user = { id: 'alice' }; render(<MakerTools />)
  fireEvent.click(screen.getByRole('button', { name: /My filament/ }))
  await screen.findByText('Alice private spool')
  fireEvent.change(screen.getByLabelText('Remaining grams for Alice private spool'), { target: { value: '20' } })
  state.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Your saved inventory changed in another tab.' }) })
  fireEvent.click(screen.getByRole('button', { name: 'Save inventory' }))
  await screen.findByText('Your saved inventory changed in another tab.')
  expect(screen.getByLabelText('Remaining grams for Alice private spool')).toHaveValue(20)
  const [, options] = state.fetch.mock.calls.find(([, opts]) => opts?.method === 'PUT')
  expect(JSON.parse(options.body)).not.toHaveProperty('userId')
})
it('erases visible private state on account changes and ignores a late prior-user load', async () => {
  state.user = { id: 'alice' }
  let resolveAlice
  state.fetch.mockImplementation(url => url.includes('catalogue') ? Promise.resolve({ ok: true, json: async () => ({ offers: [] }) }) : new Promise(resolve => { resolveAlice = resolve }))
  const view = render(<MakerTools />)
  state.user = { id: 'bob' }
  state.fetch.mockImplementation(async url => ({ ok: true, json: async () => url.includes('catalogue') ? { offers: [] } : { revision: 0, spools: [] } }))
  view.rerender(<MakerTools />)
  resolveAlice({ ok: true, json: async () => ({ revision: 1, spools: [privateSpool] }) })
  fireEvent.click(screen.getByRole('button', { name: /My filament/ }))
  await screen.findByText('Your shelf is empty. Add your first spool above.')
  expect(screen.queryByText('Alice private spool')).not.toBeInTheDocument()
  state.user = null; view.rerender(<MakerTools />)
  await waitFor(() => expect(screen.queryByText('Alice private spool')).not.toBeInTheDocument())
})
it('shows catalogue failure honestly and keeps references usable', async () => {
  state.fetch.mockRejectedValue(Error('Offline')); render(<MakerTools />)
  await screen.findByText('Live stock unavailable. Colour references still work.')
  expect(screen.getByRole('button', { name: 'Use Bambu Green in planner' })).toBeEnabled()
  fireEvent.click(screen.getByLabelText('Confirmed in stock only'))
  expect(screen.getByText(/No confirmed stock matches/)).toBeVisible()
})

it('connects the workbench to its released learning and community destinations', async () => {
  render(<MakerTools />); await screen.findByText(/Catalogue loaded/)
  expect(screen.getByRole('link', { name: 'Open coding playground' })).toHaveAttribute('href', '/maker-tools/playground')
  expect(screen.getByRole('link', { name: 'Common printing problems' })).toHaveAttribute('href', '/guides/3d-printing-problems')
  expect(screen.getByRole('link', { name: /Explore Community/ })).toHaveAttribute('href', '/community')
})
