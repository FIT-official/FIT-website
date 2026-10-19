// Phase-1 Class hub: tabs, teacher entry, honest join box, truthful recommendation labels, and a catalogue whose every
// "ready" item really exists while every "planned" item is unlinked. Synthetic: Clerk is stubbed, nothing is fetched.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'

let clerk
vi.mock('@clerk/nextjs', () => ({ useUser: () => clerk }))
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

const { default: ClassPage } = await import('../app/class/page')
const { default: ClassDetailPage, generateStaticParams, generateMetadata } = await import('../app/class/classes/[slug]/page')
const { default: ProgrammingPage } = await import('../app/class/programming/page')
const { default: TeachersPage } = await import('../app/class/teachers/page')
const { default: Library } = await import('../components/ClassroomSimulations/Library')
const { default: JoinCodeBox } = await import('../components/class/JoinCodeBox')
const { CLASSES, getClass, classModules, startingPoints, PROGRAMMING_PLAN } = await import('../lib/class/catalogue')
const { checkJoinCodeShape, normaliseJoinCode } = await import('../lib/class/joinCode')
const { getLiveSim } = await import('../lib/sims/registry')

const root = path.join(__dirname, '..')
const routeExists = href => { const clean = href.split('?')[0].replace(/^\//, ''); return ['page.jsx', 'page.js'].some(file => fs.existsSync(path.join(root, 'app', clean, file))) || fs.existsSync(path.join(root, 'app', clean.replace(/\/[^/]+$/, ''), '[blogSlug]')) && clean.startsWith('blog/') && fs.existsSync(path.join(root, 'app', clean, 'page.jsx')) }
beforeEach(() => { clerk = { isLoaded: true, isSignedIn: false, user: null }; global.fetch = vi.fn(async () => { throw new Error('no network in this test') }) })
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

describe('hub tabs and teacher entry', () => {
  it('shows Classes, Simulations and Programming tabs plus a visible For teachers button, keyboard reachable in order', () => {
    render(<ClassPage />)
    const tabs = screen.getByRole('navigation', { name: 'Class sections' })
    const links = within(tabs).getAllByRole('link')
    expect(links.map(a => [a.textContent, a.getAttribute('href')])).toEqual([['Classes', '/class'], ['Simulations', '/class/simulations'], ['Programming', '/class/programming'], ['For teachers', '/class/teachers']])
    expect(links[0]).toHaveAttribute('aria-current', 'page'); expect(links.slice(1).every(a => !a.hasAttribute('aria-current'))).toBe(true)
    expect(screen.getAllByRole('link', { name: /For teachers/ }).every(a => a.getAttribute('href') === '/class/teachers')).toBe(true)
    expect(screen.getByRole('main').querySelectorAll('a[href=""], a:not([href])')).toHaveLength(0)
  })
  it('the simulation library carries the same tab bar with Simulations current', () => {
    render(<Library />)
    const tabs = within(screen.getByRole('navigation', { name: 'Class sections' }))
    expect(tabs.getByRole('link', { name: 'Simulations' })).toHaveAttribute('aria-current', 'page')
    expect(tabs.getByRole('link', { name: 'Classes' })).toHaveAttribute('href', '/class')
  })
  it('keeps the exact computing gate', () => {
    render(<ClassPage />)
    expect(screen.queryByRole('link', { name: /^Computing$/ })).toBeNull()
    cleanup(); vi.stubEnv('COMPUTING_ENABLED', 'true'); render(<ClassPage />)
    expect(screen.getByRole('link', { name: /^Computing$/ })).toHaveAttribute('href', '/computing')
  })
  it('claims no enrolment counts, ratings, progress or popularity', () => {
    render(<ClassPage />)
    const text = screen.getByRole('main').textContent
    expect(text).not.toMatch(/\b\d[\d,]*\s+(students|learners|enrolled|users|teachers|reviews|ratings)\b/i)
    expect(text).not.toMatch(/most popular|trending|top rated|\d+% complete|your progress|AI-personali[sz]ed|personali[sz]ed for you|recommended for you/i)
  })
})

describe('class-code box (phase 1: shape check only)', () => {
  it('rejects empty and malformed codes with a reason', () => {
    render(<JoinCodeBox />)
    const box = screen.getByLabelText('Class code')
    fireEvent.click(screen.getByRole('button', { name: 'Join class' })); expect(screen.getByRole('status')).toHaveTextContent('Enter the code your teacher gave you.')
    fireEvent.change(box, { target: { value: 'AB' } }); fireEvent.click(screen.getByRole('button', { name: 'Join class' })); expect(screen.getByRole('status')).toHaveTextContent(/4 to 12/)
    fireEvent.change(box, { target: { value: 'ab!cd' } }); fireEvent.click(screen.getByRole('button', { name: 'Join class' })); expect(screen.getByRole('status')).toHaveTextContent(/letters and numbers only/)
    fireEvent.change(box, { target: { value: 'A'.repeat(13) } }); fireEvent.click(screen.getByRole('button', { name: 'Join class' })); expect(screen.getByRole('status')).toHaveTextContent(/4 to 12/)
  })
  it('a well-formed code is NOT joined, sent, checked or stored, and the page says so', () => {
    const storageSet = vi.spyOn(Storage.prototype, 'setItem')
    render(<JoinCodeBox />)
    fireEvent.change(screen.getByLabelText('Class code'), { target: { value: ' ab-c 234 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join class' }))
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('ABC234'); expect(status).toHaveTextContent(/was not sent, checked or saved/); expect(status).toHaveTextContent(/Joining is not open yet/)
    expect(status).not.toHaveTextContent(/welcome|you have joined|you are in|success/i)
    expect(global.fetch).not.toHaveBeenCalled(); expect(storageSet).not.toHaveBeenCalled(); expect(document.cookie).toBe('')
    expect(document.querySelector('form').getAttribute('action')).toBeNull()
    storageSet.mockRestore()
  })
  it('submits with Enter from the keyboard and clears the message when the text changes', () => {
    render(<JoinCodeBox />)
    const box = screen.getByLabelText('Class code')
    fireEvent.change(box, { target: { value: 'ZXCV' } }); fireEvent.submit(box.closest('form'))
    expect(screen.getByRole('status')).toHaveTextContent('ZXCV')
    fireEvent.change(box, { target: { value: 'ZXCVB' } }); expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
  it('code helpers normalise safely', () => {
    expect(normaliseJoinCode(' ab-c d ')).toBe('ABCD'); expect(normaliseJoinCode(null)).toBe(''); expect(normaliseJoinCode('ＡＢＣＤ')).toBe('ABCD')
    expect(checkJoinCodeShape('<script>').ok).toBe(false); expect(checkJoinCodeShape('ABCD').ok).toBe(true)
  })
})

describe('recommendations are labelled truthfully', () => {
  it('anonymous: curated by FIT, the same for every visitor, deterministic', () => {
    render(<ClassPage />)
    const basis = screen.getByTestId('starting-basis')
    expect(basis).toHaveTextContent('Chosen by FIT, the same for every visitor.')
    const titles = within(screen.getByRole('region', { name: 'Good places to start' })).getAllByRole('heading', { hidden: true }).length
    expect(titles).toBeGreaterThan(0)
    cleanup(); render(<ClassPage />)
    expect(startingPoints().map(c => c.slug)).toEqual(['ratio-and-fractions', 'signals-and-control', 'design-thinking-workshop'])
  })
  it('signed in: the SAME list, plus an honest note that no preferences or enrolments are held', () => {
    clerk = { isLoaded: true, isSignedIn: true, user: { id: 'user_1' } }
    render(<ClassPage />)
    const basis = screen.getByTestId('starting-basis')
    expect(basis).toHaveTextContent(/does not hold saved preferences or class enrolments/); expect(basis).toHaveTextContent(/everyone sees this same list/)
    const signedIn = within(screen.getByRole('region', { name: 'Good places to start' })).getAllByRole('link').map(a => a.getAttribute('href'))
    cleanup(); clerk = { isLoaded: true, isSignedIn: false, user: null }; render(<ClassPage />)
    const anonymous = within(screen.getByRole('region', { name: 'Good places to start' })).getAllByRole('link').map(a => a.getAttribute('href'))
    expect(signedIn).toEqual(anonymous)
  })
  it('never leaks one identity into another: switching accounts changes nothing but the note, and no private/assigned data is rendered', () => {
    clerk = { isLoaded: true, isSignedIn: true, user: { id: 'user_a' } }
    const view = render(<ClassPage />)
    clerk = { isLoaded: true, isSignedIn: true, user: { id: 'user_b' } }; view.rerender(<ClassPage />)
    expect(document.body.textContent).not.toMatch(/user_a|user_b/)
    expect(screen.queryByText(/In your class/)).toBeNull(); expect(global.fetch).not.toHaveBeenCalled()
  })
  it('while Clerk is loading, the neutral wording is used', () => {
    clerk = { isLoaded: false, isSignedIn: undefined, user: null }
    render(<ClassPage />)
    expect(screen.getByTestId('starting-basis')).toHaveTextContent('Chosen by FIT, the same for every visitor.')
  })
})

describe('catalogue integrity', () => {
  it('every simulation module is a live registry activity; every ready page module is a real route', () => {
    for (const item of CLASSES) {
      expect(item.modules.length).toBeGreaterThan(1); expect(item.outcomes.length).toBeGreaterThanOrEqual(3)
      for (const entry of item.modules) {
        if (entry.kind === 'simulation') expect(getLiveSim(entry.id), `${item.slug}:${entry.id}`).toBeTruthy()
        if (entry.kind === 'page') expect(routeExists(entry.href), `${item.slug}:${entry.href}`).toBe(true)
      }
      expect(classModules(item).some(m => m.status === 'available'), item.slug).toBe(true)
    }
  })
  it('planned modules never have a link and are labelled Planned; slugs are unique', () => {
    expect(new Set(CLASSES.map(c => c.slug)).size).toBe(CLASSES.length)
    for (const item of CLASSES) for (const m of classModules(item)) if (m.status === 'planned') { expect(m.href).toBeNull(); expect(m.kind).toBe('planned') }
    expect(PROGRAMMING_PLAN.filter(p => p.status === 'planned').length).toBeGreaterThan(1)
  })
  it('a retired simulation would be dropped, not shown as a dead link', () => {
    const fake = { slug: 'x', modules: [{ kind: 'simulation', id: 'not-a-live-sim', status: 'available' }, { kind: 'planned', title: 'Later', status: 'planned' }] }
    expect(classModules(fake).map(m => m.title)).toEqual(['Later'])
  })
})

describe('class detail routes', () => {
  it('generates one static route per class and each renders objectives, modules with honest status, and a teacher note', async () => {
    const params = generateStaticParams(); expect(params).toHaveLength(CLASSES.length)
    for (const { slug } of params) {
      const meta = await generateMetadata({ params: Promise.resolve({ slug }) }); expect(meta.alternates.canonical).toBe(`/class/classes/${slug}`)
      render(await ClassDetailPage({ params: Promise.resolve({ slug }) }))
      const main = within(screen.getByRole('main'))
      expect(main.getByRole('heading', { level: 1, name: getClass(slug).title })).toBeVisible()
      expect(main.getByRole('heading', { name: 'What you will be able to do' })).toBeVisible()
      for (const m of classModules(getClass(slug))) {
        if (m.status === 'available') expect(main.getByRole('link', { name: m.title })).toHaveAttribute('href', m.href)
        else { expect(main.queryByRole('link', { name: m.title })).toBeNull(); expect(main.getByText(m.title)).toBeVisible() }
      }
      expect(main.getAllByText(/Ready to open|Planned, not available yet/).length).toBe(classModules(getClass(slug)).length)
      cleanup()
    }
  })
  it('an unknown class is a 404, not an empty card', async () => {
    await expect(ClassDetailPage({ params: Promise.resolve({ slug: 'no-such-class' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect((await generateMetadata({ params: Promise.resolve({ slug: 'no-such-class' }) })).title).toMatch(/not found/i)
  })
  it('the electronics class says the breadboard lesson is planned rather than offering it', async () => {
    render(await ClassDetailPage({ params: Promise.resolve({ slug: 'electronics-and-3d-printing' }) }))
    expect(screen.queryByRole('link', { name: /Breadboard basics/ })).toBeNull(); expect(screen.getByText(/Breadboard basics/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Request a 3D print' })).toHaveAttribute('href', '/prints/request')
  })
})

describe('programming and teacher pages', () => {
  it('Programming separates available from planned and links the gated workspace only when enabled', () => {
    render(<ProgrammingPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Programming' })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Computing workspace' })).toBeNull()
    expect(screen.getAllByText('Planned, not available yet').length).toBeGreaterThan(2)
    expect(screen.getByText(/No programming course is open yet/)).toBeVisible()
    cleanup(); vi.stubEnv('COMPUTING_ENABLED', 'true'); render(<ProgrammingPage />)
    expect(screen.getByRole('link', { name: 'Computing workspace' })).toHaveAttribute('href', '/computing')
  })
  it('planned programming items are not links', () => {
    render(<ProgrammingPage />)
    for (const entry of PROGRAMMING_PLAN.filter(p => p.status === 'planned')) expect(screen.queryByRole('link', { name: entry.title })).toBeNull()
  })
  it('For teachers states what works today, what is planned, and that no join or class creation exists', () => {
    render(<TeachersPage />)
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('link', { name: /Sign in to the console/ })).toHaveAttribute('href', '/sign-in?redirect_url=%2Fadmin%2Fworkshop')
    expect(main.getByText(/Nothing on this page creates a class or issues a join code/)).toBeVisible()
    expect(main.getByText(/does not join anything/)).toBeVisible()
    expect(main.getAllByText('Planned, not available yet').filter(el => el.tagName === 'SPAN')).toHaveLength(3)
    expect(main.queryByText(/you can create a (live )?class|join code (is|has been) (created|issued)/i)).toBeNull()
  })
})
