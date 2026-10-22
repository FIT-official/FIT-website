// @vitest-environment jsdom
// UI behaviour for the ten-lesson library: modes, 60-minute lessons, downloads, new simulations, tiles.
// Real route handlers behind a fake fetch, in-memory collection, SYNTHETIC accounts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitFor, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectWorkspace from '@/components/ResearchProjects/ProjectWorkspace'
import Library from '@/components/ResearchProjects/Library'
import { PROJECTS, getProject, projectSummaries } from '@/lib/researchProjects/content'
import { runSimulation, SIMULATIONS } from '@/lib/researchProjects/sim'
import { createWorld, WORLD_MEMBERS, installFetch, viewerFor, SLUG } from './helpers'

// `server-only` throws outside a server bundle. This narrow mock lets server modules load under test.
vi.mock('server-only', () => ({}))

function setup() {
  const w = createWorld({ members: WORLD_MEMBERS })
  installFetch(w)
  return w
}
const status = () => screen.getByRole('region', { name: /save status/i })

beforeEach(() => { window.localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('personal and review modes for an account that has both', () => {
  it('opens in My work, can switch to Review and back, and keeps personal work saved', async () => {
    const w = setup()
    const viewer = await viewerFor(w, 'owner-a')
    const user = userEvent.setup()
    render(<ProjectWorkspace project={getProject(SLUG)} canReview hasPersonal viewer={viewer} classIds={['class-a']} />)
    await screen.findByRole('region', { name: /save status/i })
    const group = screen.getByLabelText('Choose a mode')
    expect(within(group).getByRole('button', { name: 'My work' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByRole('textbox', { name: 'Model' }), { target: { value: 'Owner A personal model text' } })
    await user.click(within(status()).getByRole('button', { name: 'Save now' }))
    await waitFor(() => expect(status()).toHaveTextContent('revision 1'))

    await user.click(within(group).getByRole('button', { name: 'Review' }))
    expect(await screen.findByRole('heading', { name: 'Teacher review' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'Review' })).toHaveAttribute('aria-pressed', 'true')
    const teams = await screen.findByRole('region', { name: 'Teams' })
    expect(within(teams).getByText('Individual m-owner-a')).toBeInTheDocument()

    await user.click(within(group).getByRole('button', { name: 'My work' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Model' })).toHaveValue('Owner A personal model text'))
  })

  it('shows no mode switch to a personal-only owner, and only review to a reviewer without personal work', async () => {
    const w = setup()
    const viewer = await viewerFor(w, 'owner-b')
    render(<ProjectWorkspace project={getProject(SLUG)} hasPersonal viewer={viewer} />)
    await screen.findByRole('region', { name: /save status/i })
    expect(screen.queryByLabelText('Choose a mode')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Teacher review' })).not.toBeInTheDocument()
    cleanup()
    const v2 = await viewerFor(w, 'teacher-1')
    render(<ProjectWorkspace project={getProject(SLUG)} canReview viewer={v2} classIds={['class-a']} />)
    expect(await screen.findByRole('heading', { name: 'Teacher review' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Choose a mode')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /save status/i })).not.toBeInTheDocument()
  })
})

describe('the same durable flow for every one of the ten lessons', () => {
  for (const p of PROJECTS) {
    it(`${p.slug}: shows the 60-minute lesson, lets a step be ticked and saved, and restores it after a refresh`, async () => {
      const w = setup()
      const viewer = await viewerFor(w, 'stu-a1')
      const user = userEvent.setup()
      const first = render(<ProjectWorkspace project={p} hasPersonal viewer={viewer} />)
      await screen.findByRole('region', { name: /save status/i })
      expect(screen.getByRole('heading', { level: 2, name: p.lesson60.title })).toBeInTheDocument()
      expect(screen.getByText(/not completing the hardware investigation/)).toBeInTheDocument()
      expect(screen.getAllByText(/ min: /).length).toBeGreaterThanOrEqual(0)
      const lessonSection = screen.getByRole('heading', { level: 2, name: p.lesson60.title }).closest('section')
      const boxes = within(lessonSection).getAllByRole('checkbox')
      expect(boxes).toHaveLength(6)
      await user.click(boxes[0])
      await user.click(boxes[5])
      expect(screen.getByText(new RegExp(`To-do progress: 2 of ${p.todo.length} items`))).toBeInTheDocument()
      await user.click(within(status()).getByRole('button', { name: 'Save now' }))
      await waitFor(() => expect(status()).toHaveTextContent('revision 1'))
      expect([...w.collection.docs.values()][0].todo).toEqual({ ['ls:' + p.lesson60.steps[0].id]: true, ['ls:' + p.lesson60.steps[5].id]: true })
      first.unmount()
      window.localStorage.clear()
      render(<ProjectWorkspace project={p} hasPersonal viewer={viewer} />)
      await waitFor(() => expect(screen.getByText(new RegExp(`To-do progress: 2 of ${p.todo.length} items`))).toBeInTheDocument())
      const again = within(screen.getByRole('heading', { level: 2, name: p.lesson60.title }).closest('section')).getAllByRole('checkbox')
      expect(again[0]).toBeChecked()
      expect(again[1]).not.toBeChecked()
      expect(again[5]).toBeChecked()
    })
  }
})

describe('projects 08 to 10 in the interface', () => {
  const NEW = PROJECTS.filter(p => ['seismometer', 'spectrometer', 'tomography'].includes(p.simId))

  for (const p of NEW) {
    it(`${p.slug}: runs its simulation, records a SYNTHETIC row, shows nine scored questions plus reflection and offers protected downloads`, async () => {
      const w = setup()
      const viewer = await viewerFor(w, 'stu-a1')
      const user = userEvent.setup()
      render(<ProjectWorkspace project={p} hasPersonal viewer={viewer} />)
      await screen.findByRole('region', { name: /save status/i })
      expect(screen.getByRole('heading', { level: 3, name: SIMULATIONS[p.simId].title })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /Add this result to the data table/ }))
      await user.click(within(status()).getByRole('button', { name: 'Save now' }))
      await waitFor(() => expect(status()).toHaveTextContent('revision 1'))
      const row = [...w.collection.docs.values()][0].dataset[0]
      expect(row.source).toBe('simulation')
      const expected = runSimulation(p.simId, {}).row
      for (const [k, v] of Object.entries(expected)) if (v !== null) expect(row.cells[k].v).toBeCloseTo(v, 9)

      expect(screen.getAllByText(/Not scored/)).toHaveLength(1)
      expect(screen.getAllByRole('radio')).toHaveLength(16)
      const downloads = screen.getByRole('heading', { name: 'Downloadable teaching files' }).parentElement
      const links = within(downloads).getAllByRole('link')
      expect(links.length).toBe(p.downloads.length)
      for (const link of links) {
        expect(link.getAttribute('href')).toMatch(/^\/api\/research-projects\/assets\?id=[a-z0-9-]+$/)
        expect(link).toHaveAttribute('download')
      }
      expect(within(downloads).getAllByText(/SYNTHETIC/).length).toBeGreaterThan(0)
      expect(document.body.textContent).not.toMatch(/teacher_candidate|teacher_simulation|tomography-teacher/)
    })
  }

  it('shows a source note with a "link checked" status instead of claiming the page was read', async () => {
    const w = setup()
    const viewer = await viewerFor(w, 'stu-a1')
    const p = getProject('resistor-network-tomography')
    render(<ProjectWorkspace project={p} hasPersonal viewer={viewer} />)
    await screen.findByRole('region', { name: /save status/i })
    expect(screen.getAllByText(/link checked by the content owner on 22 October 2026/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/CC BY-NC-SA 4\.0/).length).toBeGreaterThan(0)
    expect(screen.queryByText('Read')).not.toBeInTheDocument()
  })

  it('shows teacher-only notes and files to the review role only, when the answer key is requested', async () => {
    const w = setup()
    const p = getProject('resistor-network-tomography')
    const user = userEvent.setup()
    const viewer = await viewerFor(w, 'owner-a')
    render(<ProjectWorkspace project={p} canReview hasPersonal viewer={viewer} classIds={['class-a']} />)
    await screen.findByRole('region', { name: /save status/i })
    expect(screen.queryByText(/Teacher-only notes and files/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Show answer key in questions' }))
    expect(await screen.findByText('Teacher-only notes and files')).toBeInTheDocument()
    expect(screen.getByText(/edge 7, connecting nodes 4 and 5/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Teacher plot: candidate residuals/ })
    expect(link.getAttribute('href')).toBe('/api/research-projects/assets?id=tomography-teacher-simulation-plot')
    cleanup()

    const v2 = await viewerFor(w, 'owner-b')
    render(<ProjectWorkspace project={p} hasPersonal viewer={v2} />)
    await screen.findByRole('region', { name: /save status/i })
    expect(document.body.textContent).not.toMatch(/edge 7|Teacher-only notes/)
  })
})

describe('library tiles', () => {
  it('shows an original protected image with alt text on every one of the ten tiles', () => {
    render(<Library projects={projectSummaries()} canReview />)
    const tiles = screen.getAllByRole('link')
    expect(tiles).toHaveLength(10)
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(10)
    for (const img of images) {
      expect(img.getAttribute('src')).toMatch(/^\/api\/research-projects\/assets\?id=[a-z0-9-]+$/)
      expect(img.getAttribute('alt').length).toBeGreaterThan(40)
    }
    expect(screen.getAllByText(/60-minute lesson/).length).toBeGreaterThanOrEqual(10)
    expect(screen.getByText('Calibrated vibration sensor')).toBeInTheDocument()
    expect(screen.getByText('Calibrated visible-light spectrometer')).toBeInTheDocument()
    expect(screen.getByText('Resistor-network tomography')).toBeInTheDocument()
  })
})
