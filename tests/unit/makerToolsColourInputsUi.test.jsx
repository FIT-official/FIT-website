import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const state = vi.hoisted(() => ({ user: null, fetch: vi.fn() }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: state.user, isLoaded: true }), SignInButton: ({ children }) => children }))
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
// eslint-disable-next-line @next/next/no-img-element
vi.mock('next/image', () => ({ default: ({ unoptimized, ...props }) => <img {...props} alt={props.alt} /> }))
import MakerTools from '@/components/MakerTools/MakerTools'
import { COLOURS } from '@/lib/makerTools/colours'
const green = COLOURS.find(c => c.name === 'Bambu Green')
const offers = [{ referenceId: green.id, optionId: 'o1', optionName: 'Bambu Green / Spool', format: 'spool', availableRolls: 2, stockSource: 'shop', checkedAt: '2026-10-20T00:00:00Z', href: '/shop/p/green', preview: null }]
const hexBox = () => screen.getByLabelText('Target HEX')
const channel = name => screen.getByLabelText(`${name} channel`)
const swatch = name => screen.getByRole('button', { name: new RegExp(`^${name} #`) })
const picker = () => screen.getByLabelText('Pick a target colour')
const summary = () => screen.getByRole('status', { name: 'Selected colour' })
const matchHeadings = () => screen.queryAllByRole('heading', { level: 3 }).map(h => h.textContent)
const rgbValues = () => ['Red', 'Green', 'Blue'].map(n => channel(n).value)
beforeEach(() => {
  state.user = null; vi.clearAllMocks(); vi.stubGlobal('fetch', state.fetch)
  state.fetch.mockImplementation(async () => ({ ok: true, json: async () => ({ offers }) }))
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('uses plain headings without marketing slogans', async () => {
  render(<MakerTools />); await screen.findByText(/Catalogue loaded/)
  expect(screen.getByRole('heading', { level: 1, name: 'Maker Tools' })).toBeInTheDocument()
  for (const slogan of [/make more/i, /guess less/i, /try\. observe/i, /keep your next idea/i, /from hex to filament/i, /next idea/i]) expect(document.body.textContent).not.toMatch(slogan)
  for (const tab of ['Colour matcher', 'Material estimator', 'My filament', 'Project planner']) expect(screen.getByRole('button', { name: tab })).toBeInTheDocument()
})

it('starts with the default colour shown consistently in every control', async () => {
  render(<MakerTools />); await screen.findByText(/Catalogue loaded/)
  expect(hexBox()).toHaveValue('#00AE42'); expect(rgbValues()).toEqual(['0', '174', '66']); expect(picker()).toHaveValue('#00ae42')
  expect(summary()).toHaveTextContent('Custom colour'); expect(summary()).toHaveTextContent('#00AE42'); expect(summary()).toHaveTextContent('0, 174, 66')
  expect(summary().querySelector('span').style.background).toBe('rgb(0, 174, 66)')
  expect(matchHeadings()[0]).toBe('Bambu Green')
})

it('selecting a swatch updates picker, HEX, RGB, summary and matches, and marks only it pressed', async () => {
  render(<MakerTools />); await screen.findByText(/Catalogue loaded/)
  fireEvent.click(swatch('Red'))
  expect(hexBox()).toHaveValue('#E53935'); expect(rgbValues()).toEqual(['229', '57', '53']); expect(picker()).toHaveValue('#e53935')
  expect(summary()).toHaveTextContent('Red swatch'); expect(swatch('Red')).toHaveAttribute('aria-pressed', 'true')
  const group = screen.getByRole('group', { name: 'Named colours' })
  expect(within(group).getAllByRole('button', { pressed: true })).toHaveLength(1)
  expect(screen.getByText(/30 reference matches for #E53935/)).toBeInTheDocument() // status counts all references; only the closest six are rendered
  expect(matchHeadings()).toHaveLength(6); expect(matchHeadings()[0]).not.toBe('Bambu Green')
  fireEvent.click(swatch('Blue'))
  expect(swatch('Red')).toHaveAttribute('aria-pressed', 'false'); expect(swatch('Blue')).toHaveAttribute('aria-pressed', 'true')
})

it('swatches operate from the keyboard', async () => {
  const user = userEvent.setup(); render(<MakerTools />); await screen.findByText(/Catalogue loaded/)
  swatch('Teal').focus(); await user.keyboard('{Enter}')
  expect(hexBox()).toHaveValue('#00897B'); expect(swatch('Teal')).toHaveAttribute('aria-pressed', 'true')
  swatch('Orange').focus(); await user.keyboard(' ')
  expect(hexBox()).toHaveValue('#FB8C00')
})

it('typing a short or lower-case HEX syncs RGB, picker and the selected swatch', async () => {
  render(<MakerTools />); await screen.findByText(/Catalogue loaded/)
  fireEvent.change(hexBox(), { target: { value: '#fff' } })
  expect(rgbValues()).toEqual(['255', '255', '255']); expect(swatch('White')).toHaveAttribute('aria-pressed', 'true')
  expect(picker()).toHaveValue('#ffffff'); expect(summary()).toHaveTextContent('#FFFFFF')
  fireEvent.change(hexBox(), { target: { value: 'e53935' } })
  expect(rgbValues()).toEqual(['229', '57', '53']); expect(swatch('Red')).toHaveAttribute('aria-pressed', 'true')
  fireEvent.blur(hexBox()); expect(hexBox()).toHaveValue('#E53935')
})

it('typing all three RGB channels syncs HEX and picker', async () => {
  render(<MakerTools />); await screen.findByText(/Catalogue loaded/)
  fireEvent.change(channel('Red'), { target: { value: '1' } }); fireEvent.change(channel('Green'), { target: { value: '2' } }); fireEvent.change(channel('Blue'), { target: { value: '3' } })
  expect(hexBox()).toHaveValue('#010203'); expect(picker()).toHaveValue('#010203'); expect(summary()).toHaveTextContent('1, 2, 3')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('does not show matches or coerce values for incomplete or invalid HEX', async () => {
  render(<MakerTools />); await screen.findByText(/Catalogue loaded/)
  fireEvent.change(hexBox(), { target: { value: '#12' } })
  expect(screen.getByRole('alert')).toHaveTextContent('3- or 6-digit'); expect(hexBox()).toHaveAttribute('aria-invalid', 'true')
  expect(hexBox()).toHaveAccessibleDescription(/3- or 6-digit/)
  expect(matchHeadings()).toEqual([]); expect(screen.getByText('Enter a complete, valid colour to see matches.')).toBeInTheDocument()
  expect(summary()).toHaveTextContent('No colour selected')
  expect(screen.queryByRole('button', { name: /^Use .* in planner$/ })).not.toBeInTheDocument()
  expect(picker()).toHaveValue('#00ae42') // keeps the last valid colour rather than falling back to black
  fireEvent.change(hexBox(), { target: { value: '#12ZZ56' } })
  expect(screen.getByRole('alert')).toHaveTextContent('0–9 and A–F'); expect(matchHeadings()).toEqual([])
  fireEvent.change(hexBox(), { target: { value: '' } })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(matchHeadings()).toEqual([]); expect(summary()).toHaveTextContent('No colour selected')
  fireEvent.change(hexBox(), { target: { value: '#1E4FD8' } })
  expect(matchHeadings()).toHaveLength(6); expect(swatch('Blue')).toHaveAttribute('aria-pressed', 'true')
})

it.each(['256', '-1', '1.5', 'abc'])('rejects RGB channel %s without matching', async bad => {
  render(<MakerTools />); await screen.findByText(/Catalogue loaded/)
  fireEvent.change(channel('Green'), { target: { value: bad } })
  expect(screen.getByRole('alert')).toHaveTextContent('Green: Use a whole number from 0 to 255.')
  expect(channel('Green')).toHaveAttribute('aria-invalid', 'true'); expect(channel('Red')).toHaveAttribute('aria-invalid', 'false')
  expect(matchHeadings()).toEqual([]); expect(summary()).toHaveTextContent('No colour selected')
  expect(swatch('Green')).toHaveAttribute('aria-pressed', 'false')
  expect(channel('Green')).toHaveValue(bad) // typed text stays so the user can correct it
  fireEvent.change(channel('Green'), { target: { value: '200' } })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(hexBox()).toHaveValue('#00C842'); expect(matchHeadings()).toHaveLength(6)
})

it('treats a blank RGB channel as incomplete, not zero', async () => {
  render(<MakerTools />); await screen.findByText(/Catalogue loaded/)
  fireEvent.change(channel('Blue'), { target: { value: '' } })
  expect(screen.getByRole('alert')).toHaveTextContent('all three RGB values'); expect(matchHeadings()).toEqual([])
  expect(summary()).toHaveTextContent('No colour selected')
  fireEvent.change(channel('Blue'), { target: { value: '0' } }); expect(hexBox()).toHaveValue('#00AE00')
})

it('recovers from an invalid RGB entry by choosing a swatch', async () => {
  render(<MakerTools />); await screen.findByText(/Catalogue loaded/)
  fireEvent.change(channel('Red'), { target: { value: '999' } })
  fireEvent.click(swatch('Purple'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(rgbValues()).toEqual(['123', '63', '196']); expect(channel('Red')).toHaveAttribute('aria-invalid', 'false')
})

it('labels the colour controls for assistive technology', async () => {
  render(<MakerTools />); await screen.findByText(/Catalogue loaded/)
  expect(within(screen.getByRole('group', { name: 'Named colours' })).getAllByRole('button')).toHaveLength(16)
  expect(screen.getByRole('group', { name: 'RGB, 0–255 each' })).toBeInTheDocument()
  for (const n of ['Red', 'Green', 'Blue']) expect(channel(n)).toHaveAttribute('inputmode', 'numeric')
})

it('shows the loading state, then stock and source detail, then hands off to the planner', async () => {
  let release; state.fetch.mockImplementation(() => new Promise(r => { release = () => r({ ok: true, json: async () => ({ offers }) }) }))
  render(<MakerTools />)
  expect(screen.getByText('Checking FIT catalogue stock…')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Refresh stock' })).toBeDisabled()
  expect(matchHeadings()[0]).toBe('Bambu Green'); expect(screen.getAllByText(/No confirmed catalogue variant/).length).toBeGreaterThan(0)
  release(); await screen.findByText(/Catalogue loaded/)
  expect(screen.getByText(/2 rolls available/)).toBeInTheDocument(); expect(screen.getByText(/· FIT shop/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Use Bambu Green in planner' }))
  expect(screen.getByLabelText('Project colour 1')).toHaveValue(green.id)
})

it('filters by confirmed stock and explains an empty result', async () => {
  render(<MakerTools />); await screen.findByText(/Catalogue loaded/)
  fireEvent.click(screen.getByLabelText('Confirmed in stock only'))
  expect(matchHeadings()).toEqual(['Bambu Green']); expect(screen.getByText(/1 reference matches for #00AE42/)).toBeInTheDocument()
  // Ranking is approximate, not an equality filter: another target still lists the stocked reference.
  fireEvent.click(swatch('Red')); expect(matchHeadings()).toEqual(['Bambu Green'])
  // The fixture has no refill stock, so a refill-only filter has nothing confirmed.
  fireEvent.change(screen.getByLabelText('Packaging'), { target: { value: 'refill' } })
  expect(matchHeadings()).toEqual([]); expect(screen.getByText(/No confirmed stock matches this filter/)).toBeVisible()
  expect(screen.getByText(/0 reference matches for #E53935/)).toBeInTheDocument()
  fireEvent.change(hexBox(), { target: { value: '#1' } })
  expect(screen.queryByText(/No confirmed stock matches/)).not.toBeInTheDocument()
})

it('keeps colour references and the approximation note when stock fails to load', async () => {
  state.fetch.mockRejectedValue(Error('Offline')); render(<MakerTools />)
  await screen.findByText('Live stock unavailable. Colour references still work.')
  fireEvent.click(swatch('Orange')); expect(matchHeadings()).toHaveLength(6)
  fireEvent.click(screen.getByLabelText('Confirmed in stock only')); expect(screen.getByText(/refresh stock to confirm availability/)).toBeInTheDocument()
  fireEvent.click(screen.getByText('How colour matching works'))
  expect(screen.getByText(/approximation, not a percentage chance/)).toBeVisible()
  expect(screen.getByRole('link', { name: 'official HEX table' })).toHaveAttribute('href', expect.stringMatching(/^https:\/\//))
})

it('keeps the estimator and multicolour planner working', async () => {
  render(<MakerTools />); await screen.findByText(/Catalogue loaded/)
  fireEvent.click(screen.getByRole('button', { name: 'Material estimator' })); expect(screen.getByText('110 g')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Project planner' }))
  fireEvent.click(screen.getByRole('button', { name: '+ Add colour' }))
  expect(screen.getByLabelText('Project colour 2')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Required grams for colour 1'), { target: { value: '1000' } })
  fireEvent.change(screen.getByLabelText('Required grams for colour 2'), { target: { value: '500' } })
  expect(screen.getByText(/Plan for 2 × 1 kg packs/)).toBeVisible()
})
