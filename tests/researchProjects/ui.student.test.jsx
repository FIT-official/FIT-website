// @vitest-environment jsdom
// Student workspace UI against the REAL route handlers (via a fake fetch) and an in-memory
// collection. All accounts, groups and classes are SYNTHETIC.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitFor, fireEvent, act, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectWorkspace from '@/components/ResearchProjects/ProjectWorkspace'
import { getProject } from '@/lib/researchProjects/content'
import { runSimulation, SIMULATIONS } from '@/lib/researchProjects/sim'
import { createWorld, WORLD_MEMBERS, installFetch, viewerFor, fullDoc, SLUG, request, read } from './helpers'
import { handleRecordsPut, handleActionsPost, handleRecordsGet } from '@/lib/researchProjects/http'

const project = getProject(SLUG)

function setup(options = {}) {
  const w = createWorld({ members: WORLD_MEMBERS, ...options })
  installFetch(w)
  return w
}

async function open(w, userId = 'stu-a1', slug = SLUG) {
  const viewer = await viewerFor(w, userId)
  const utils = render(<ProjectWorkspace project={getProject(slug)} role="student" viewer={viewer} classIds={null} />)
  await screen.findByRole('region', { name: /save status/i })
  return { ...utils, viewer, user: userEvent.setup() }
}

const status = () => screen.getByRole('region', { name: /save status/i })
const PLAN_NAMES = { question: 'Bounded research question', model: 'Model', dataPlan: 'Measured dataset', uncertainty: 'Uncertainty', improvement: 'Justified improvement' }
const plan = name => screen.getByRole('textbox', { name })
const type = (el, value) => fireEvent.change(el, { target: { value } })
// jsdom cannot compute accessible names across MathML, so queries over elements whose text can contain
// formulae use label or text matching instead of role+name.
const rowOf = text => screen.getByText(text).closest('tr')

// Server-side mutation made "by someone else" (a teammate on another device, or a teacher).
async function api(w, userId, handler, method, path, body) {
  const before = w.session.userId
  w.session.userId = userId
  const response = await handler(request(method, path, { body }), w.deps)
  w.session.userId = before
  return read(response)
}
const teammateSave = async (w, userId, doc) => {
  const current = await api(w, userId, handleRecordsGet, 'GET', `/api/research-projects/records?slug=${SLUG}`)
  return api(w, userId, handleRecordsPut, 'PUT', '/api/research-projects/records', { slug: SLUG, viewer: current.body.viewer, baseRevision: current.body.record.revision, doc })
}

beforeEach(() => { window.localStorage.clear() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('project content as a student sees it', () => {
  it('shows the question, published-versus-proposed labels, sources at point of use, and labelled original diagrams', async () => {
    const w = setup()
    await open(w)
    expect(screen.getByRole('heading', { level: 1, name: project.title })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Published build/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Proposed student investigation \(not a claim that FIT built this\)/ })).toBeInTheDocument()
    const link = screen.getAllByRole('link', { name: /openUC2 HoloBox documentation/ })[0]
    expect(link).toHaveAttribute('href', 'https://docs.openuc2.com/usage/disc/holobox/')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    const figures = screen.getAllByAltText(/block diagram|two panels/i)
    expect(figures.length).toBeGreaterThanOrEqual(2)
    for (const img of figures) expect(img.getAttribute('src')).toMatch(/^\/research-projects\/diagrams\/.+\.svg$/)
    expect(screen.getAllByText('Diagram (original, explanatory)').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText(/Original explanatory diagram/).length).toBeGreaterThanOrEqual(2)
  })

  it('renders mathematics through KaTeX with MathML and shows no raw TeX', async () => {
    const w = setup()
    const { container } = await open(w)
    expect(container.querySelectorAll('.katex').length).toBeGreaterThan(10)
    expect(container.querySelectorAll('math').length).toBeGreaterThan(10)
    expect(container.querySelectorAll('.katex-display').length).toBeGreaterThanOrEqual(4)
    // Visible text: drop the MathML branch (read by assistive technology) which carries its TeX annotation.
    const clone = container.cloneNode(true)
    clone.querySelectorAll('.katex-mathml, textarea, input').forEach(n => n.remove())
    const visible = clone.textContent
    expect(visible).not.toMatch(/\\(frac|lambda|sqrt|mathrm|text|theta|sum|Delta|pi)\b/)
    expect(visible).not.toMatch(/\$/)
    expect(visible).not.toMatch(/[\^_]\{/)
  })

  it('keeps every project working: each of the seven mounts with its simulation, data table and questions', async () => {
    const { PROJECTS } = await import('@/lib/researchProjects/content')
    for (const p of PROJECTS) {
      const w = setup()
      const viewer = await viewerFor(w, 'stu-a1')
      const { unmount, container } = render(<ProjectWorkspace project={p} role="student" viewer={viewer} />)
      await screen.findByRole('region', { name: /save status/i })
      expect(screen.getByRole('heading', { level: 1, name: p.title })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 3, name: SIMULATIONS[p.simId].title })).toBeInTheDocument()
      expect(screen.getAllByRole('radio').length).toBe(8)
      expect(screen.getByRole('heading', { name: 'Rubric' })).toBeInTheDocument()
      expect(screen.getAllByRole('textbox').length).toBeGreaterThan(8)
      expect(container.querySelectorAll('svg[role="img"]').length).toBeGreaterThan(0)
      expect(container.querySelectorAll('img').length).toBeGreaterThanOrEqual(2)
      unmount()
      cleanup()
    }
  })
})

describe('simulation and data recording', () => {
  it('adds a simulation result as a data row with the same numbers, then saves it', async () => {
    const w = setup()
    const { user } = await open(w)
    expect(screen.getByText(/No data yet/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Add this result to the data table/ }))
    expect(screen.getByText('Added a simulation row to your data table.')).toBeInTheDocument()
    expect(screen.queryByText(/No data yet/)).not.toBeInTheDocument()
    const expected = runSimulation('holobox', {}).row
    expect(screen.getByLabelText('Distance z, row 1')).toHaveValue(String(expected.distanceMm))
    expect(screen.getByLabelText('Reconstructed width, row 1')).toHaveValue(String(expected.reconWidthUm))
    await user.click(within(status()).getByRole('button', { name: 'Save now' }))
    await waitFor(() => expect(status()).toHaveTextContent('All changes saved (revision 1)'))
    const stored = [...w.collection.docs.values()][0]
    expect(stored.dataset).toHaveLength(1)
    expect(stored.dataset[0]).toMatchObject({ source: 'simulation', cells: { distanceMm: { v: expected.distanceMm }, reconWidthUm: { v: expected.reconWidthUm } } })
  })

  it('changes the simulation outputs when a parameter changes, and rejects out-of-range input', async () => {
    const w = setup()
    await open(w)
    const z = screen.getByRole('spinbutton', { name: /Object-to-sensor distance z/ })
    const before = rowOf('Effective NA (smaller of the two)').textContent
    type(z, '40')
    await waitFor(() => expect(rowOf('Effective NA (smaller of the two)').textContent).not.toBe(before))
    type(z, '999')
    expect(z).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/Enter a value from 1 to 60/)).toBeInTheDocument()
    expect(rowOf('Effective NA (smaller of the two)').textContent).not.toBe(before)
  })

  it('locks measured rows until the teacher records the safety review, and shows column statistics', async () => {
    const w = setup()
    const { user } = await open(w)
    expect(screen.getByRole('button', { name: 'Add a measured row' })).toBeDisabled()
    expect(screen.getByText(/Measured rows unlock after your teacher records the safety review/)).toBeInTheDocument()
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: /Add this result to the data table/ }))
      type(screen.getByLabelText(`Distance z, row ${i + 1}`), String(10 * (i + 1)))
    }
    await user.selectOptions(screen.getByRole('combobox', { name: 'Column' }), 'distanceMm')
    expect(screen.getByText(/n = 3; mean = 20 mm; sample s.d. = 10; standard error = 5.77/)).toBeInTheDocument()
  })
})

describe('saving, refresh persistence and the to-do list', () => {
  it('saves plan, answers and ticked to-do items, and restores them after a refresh', async () => {
    const w = setup()
    const first = await open(w)
    type(plan('Bounded research question'), 'How does z limit sharpness for a 60 micrometre strip?')
    await first.user.click(screen.getByLabelText(/Pixel pitch fixes the largest angle/))
    type(screen.getByRole('textbox', { name: 'Numeric answer to question 4' }), '0.283')
    await first.user.click(screen.getByLabelText(/My teacher has approved the specific light source/))
    expect(screen.getByText(new RegExp(`To-do progress: 1 of ${project.todo.length} items`))).toBeInTheDocument()
    await first.user.click(within(status()).getByRole('button', { name: 'Save now' }))
    await waitFor(() => expect(status()).toHaveTextContent('revision 1'))
    first.unmount()

    // "Refresh": a brand-new mount loads from the server.
    window.localStorage.clear()
    const second = await open(w)
    await waitFor(() => expect(plan('Bounded research question')).toHaveValue('How does z limit sharpness for a 60 micrometre strip?'))
    expect(screen.getByLabelText(/Pixel pitch fixes the largest angle/)).toBeChecked()
    expect(screen.getByLabelText(/My teacher has approved the specific light source/)).toBeChecked()
    expect(screen.getByText(new RegExp(`To-do progress: 1 of ${project.todo.length} items`))).toBeInTheDocument()
    expect(status()).toHaveTextContent('last edited by Avery')
    second.unmount()
  })

  it('autosaves after a pause without pressing anything', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const w = setup()
    await open(w)
    type(plan('Model'), 'Angular spectrum method, 1D scalar waves')
    expect(status()).toHaveTextContent('Unsaved changes')
    await act(async () => { await vi.advanceTimersByTimeAsync(1700) })
    await waitFor(() => expect(status()).toHaveTextContent('revision 1'))
    expect([...w.collection.docs.values()][0].plan.model).toBe('Angular spectrum method, 1D scalar waves')
  })

  it('keeps the same record for teammates and a separate one for another group', async () => {
    const w = setup()
    await teammateSave(w, 'stu-a1', fullDoc(project, { plan: { question: 'Group one shared question', model: '', dataPlan: '', uncertainty: '', improvement: '' } }))
    const mate = await open(w, 'stu-a2')
    await waitFor(() => expect(plan('Bounded research question')).toHaveValue('Group one shared question'))
    mate.unmount()
    const other = await open(w, 'stu-a3')
    expect(plan('Bounded research question')).toHaveValue('')
    other.unmount()
  })
})

describe('conflicts, offline and errors', () => {
  it('shows an explicit conflict, keeps the student’s typing, and lets them choose what to keep', async () => {
    const w = setup()
    const { user, unmount } = await open(w, 'stu-a1')
    type(plan('Bounded research question'), 'Avery question v1 of the plan')
    await user.click(within(status()).getByRole('button', { name: 'Save now' }))
    await waitFor(() => expect(status()).toHaveTextContent('revision 1'))

    // Blair saves a different edit from another device.
    const blair = await teammateSave(w, 'stu-a2', fullDoc(project, { plan: { question: 'Blair question v2 of the plan', model: 'Blair model text for the plan', dataPlan: '', uncertainty: '', improvement: '' } }))
    expect(blair.status).toBe(200)

    type(plan('Bounded research question'), 'Avery question v3 of the plan')
    await user.click(within(status()).getByRole('button', { name: 'Save now' }))
    const conflict = await screen.findByText('Your team’s record changed')
    expect(conflict).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Your team’s record changed')
    expect(status()).toHaveTextContent('Conflict: nothing was overwritten')
    expect(screen.getByText(/last edited by Blair/)).toBeInTheDocument()
    expect(screen.getByText(/Differences between the two versions: .*plan field/)).toBeInTheDocument()
    // Nothing was overwritten on the server, and the student's text is still on screen.
    expect([...w.collection.docs.values()][0].plan.question).toBe('Blair question v2 of the plan')
    expect(plan('Bounded research question')).toHaveValue('Avery question v3 of the plan')
    expect(plan('Bounded research question')).toHaveAttribute('readonly')

    await user.click(screen.getByRole('button', { name: /Keep my edits and save them on top/ }))
    await waitFor(() => expect(screen.queryByText('Your team’s record changed')).not.toBeInTheDocument())
    await user.click(within(status()).getByRole('button', { name: 'Save now' }))
    await waitFor(() => expect(status()).toHaveTextContent('revision 3'))
    expect([...w.collection.docs.values()][0].plan.question).toBe('Avery question v3 of the plan')
    unmount()
  })

  it('lets the student take the latest version instead, discarding their edit only by choice', async () => {
    const w = setup()
    const { user } = await open(w, 'stu-a1')
    type(plan('Bounded research question'), 'Avery first plan text')
    await user.click(within(status()).getByRole('button', { name: 'Save now' }))
    await waitFor(() => expect(status()).toHaveTextContent('revision 1'))
    await teammateSave(w, 'stu-a2', fullDoc(project, { plan: { question: 'Blair replacement plan text', model: '', dataPlan: '', uncertainty: '', improvement: '' } }))
    type(plan('Bounded research question'), 'Avery unsaved change')
    await user.click(within(status()).getByRole('button', { name: 'Save now' }))
    await user.click(await screen.findByRole('button', { name: /Use the latest saved version/ }))
    await waitFor(() => expect(plan('Bounded research question')).toHaveValue('Blair replacement plan text'))
    expect(status()).toHaveTextContent('revision 2')
    expect(screen.getByText(/discarded because you chose to/)).toBeInTheDocument()
  })

  it('stays usable offline, keeps edits across a refresh, and saves after reconnecting', async () => {
    const w = setup()
    const first = await open(w)
    w.hook = async () => { throw new TypeError('Failed to fetch') }
    type(plan('Model'), 'Written while the network was down')
    await first.user.click(within(status()).getByRole('button', { name: 'Save now' }))
    await waitFor(() => expect(status()).toHaveTextContent(/Offline: changes are kept on this device/))
    expect(screen.getByRole('button', { name: 'Retry save' })).toBeEnabled()
    expect(plan('Model')).toHaveValue('Written while the network was down')
    expect(w.collection.docs.size).toBe(0)

    // Refresh while offline-edited: the unsaved text comes back from this device.
    first.unmount()
    w.hook = null
    const second = await open(w)
    await waitFor(() => expect(plan('Model')).toHaveValue('Written while the network was down'))
    expect(screen.getByText(/Restored unsaved edits from this device/)).toBeInTheDocument()
    await second.user.click(within(status()).getByRole('button', { name: 'Save now' }))
    await waitFor(() => expect(status()).toHaveTextContent('revision 1'))
    expect([...w.collection.docs.values()][0].plan.model).toBe('Written while the network was down')
  })

  it('shows a clear error with a retry for server failures, and keeps the text', async () => {
    const w = setup()
    const { user } = await open(w)
    let fail = true
    w.hook = async (method) => (method === 'PUT' && fail ? new Response(JSON.stringify({ error: 'The research library is temporarily unavailable.', code: 'unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } }) : undefined)
    type(plan('Model'), 'Text that must not be lost')
    await user.click(within(status()).getByRole('button', { name: 'Save now' }))
    await waitFor(() => expect(status()).toHaveTextContent('Not saved'))
    expect(screen.getByText(/temporarily unavailable/)).toBeInTheDocument()
    expect(plan('Model')).toHaveValue('Text that must not be lost')
    fail = false
    await user.click(within(status()).getByRole('button', { name: 'Retry save' }))
    await waitFor(() => expect(status()).toHaveTextContent('revision 1'))
  })

  it('shows what the server said when a measured row is refused', async () => {
    const w = setup()
    const { user } = await open(w)
    // Force a measured row past the disabled button, as a hostile or out-of-date client might.
    await user.click(screen.getByRole('button', { name: /Add this result to the data table/ }))
    w.hook = async (method, path, init) => {
      if (method !== 'PUT') return undefined
      const body = JSON.parse(init.body)
      body.doc.dataset[0].source = 'measured'
      init.body = JSON.stringify(body)
      return undefined
    }
    await user.click(within(status()).getByRole('button', { name: 'Save now' }))
    await waitFor(() => expect(status()).toHaveTextContent('Not saved'))
    expect(screen.getByText(/Measured data can be recorded after your teacher has recorded the safety review/)).toBeInTheDocument()
    expect(w.collection.docs.size).toBe(0)
  })

  it('reports load failures with a retry, and a denial for a non-member', async () => {
    const w = setup()
    const viewer = await viewerFor(w, 'stu-a1')
    w.hook = async () => { throw new TypeError('Failed to fetch') }
    render(<ProjectWorkspace project={project} role="student" viewer={viewer} />)
    expect(await screen.findByText('Could not load your record')).toBeInTheDocument()
    expect(screen.getByText(/appear to be offline/)).toBeInTheDocument()
    w.hook = null
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('region', { name: /save status/i })
    cleanup()

    const w2 = setup()
    const v2 = 'x'.repeat(24)
    w2.session.userId = 'someone-else'
    render(<ProjectWorkspace project={project} role="student" viewer={v2} />)
    expect(await screen.findByText('Not available')).toBeInTheDocument()
    expect(screen.getByText(/not available for your account/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Bounded research question/)).not.toBeInTheDocument()
  })
})

describe('account switching and stale responses', () => {
  it('stops saving when the signed-in account changes in another tab, and never writes to the new account', async () => {
    const w = setup()
    const { user } = await open(w, 'stu-a1')
    type(plan('Bounded research question'), 'Typed as Avery before the switch')
    w.session.userId = 'stu-a3' // another tab signs in as a different student
    await user.click(within(status()).getByRole('button', { name: 'Save now' }))
    await waitFor(() => expect(status()).toHaveTextContent('Signed in as a different account'))
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument()
    expect(w.collection.docs.size).toBe(0)
    expect(plan('Bounded research question')).toHaveAttribute('readonly')
  })

  it('ignores a load response that belongs to another account', async () => {
    const w = setup()
    const staleViewer = await viewerFor(w, 'stu-a1')
    w.session.userId = 'stu-a3'
    render(<ProjectWorkspace project={project} role="student" viewer={staleViewer} />)
    expect(await screen.findByRole('heading', { name: 'Signed in as a different account' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Bounded research question' })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Saved question')
  })

  it('does not leak one account’s unsaved device copy into another account', async () => {
    const w = setup()
    const first = await open(w, 'stu-a1')
    w.hook = async () => { throw new TypeError('offline') }
    type(plan('Model'), 'Avery private offline draft')
    await first.user.click(within(status()).getByRole('button', { name: 'Save now' }))
    await waitFor(() => expect(status()).toHaveTextContent('Offline'))
    first.unmount()
    w.hook = null
    const other = await open(w, 'stu-a3')
    expect(plan('Model')).toHaveValue('')
    expect(screen.queryByText(/Restored unsaved edits/)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Avery private offline draft')
    other.unmount()
  })

  it('aborts an in-flight load on unmount and does not update state afterwards', async () => {
    const w = setup()
    const viewer = await viewerFor(w, 'stu-a1')
    let release
    const gate = new Promise(r => { release = r })
    w.hook = async (method) => { if (method === 'GET') await gate; return undefined }
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = render(<ProjectWorkspace project={project} role="student" viewer={viewer} />)
    expect(screen.getByText(/Loading your team’s record/)).toBeInTheDocument()
    unmount()
    release()
    await act(async () => { await Promise.resolve() })
    expect(errors).not.toHaveBeenCalled()
  })

  it('discards a slow response from an earlier request once a newer load has finished', async () => {
    const w = setup()
    const viewer = await viewerFor(w, 'stu-a1')
    const other = getProject('tinylev-acoustic-levitator')
    let release
    const gate = new Promise(r => { release = r })
    let first = true
    const stale = new Response(JSON.stringify({
      record: { exists: true, revision: 7, status: 'draft', doc: { plan: { question: 'STALE answer from the first request', model: '', dataPlan: '', uncertainty: '', improvement: '' }, answers: {}, dataset: [], todo: {} }, feedback: [], events: [], keysReleased: false, safetyApproved: false, submissionCount: 0, updatedBy: null },
      viewer, role: 'student',
    }), { status: 200, headers: { 'content-type': 'application/json' } })
    w.hook = async (method, path) => {
      if (method !== 'GET' || path !== '/api/research-projects/records') return undefined
      if (first) { first = false; await gate; return stale }
      return undefined
    }
    const { rerender } = render(<ProjectWorkspace project={project} role="student" viewer={viewer} />)
    await waitFor(() => expect(w.calls.filter(c => c.method === 'GET')).toHaveLength(1))
    // The student moves on before the first request answers; a second load for another project finishes first.
    rerender(<ProjectWorkspace project={other} role="student" viewer={viewer} />)
    await screen.findByRole('region', { name: /save status/i })
    expect(w.calls.filter(c => c.method === 'GET')).toHaveLength(2)
    expect(w.calls[1].search).toContain(other.slug)
    release()
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(plan('Bounded research question')).toHaveValue('')
    expect(document.body.textContent).not.toContain('STALE answer')
    expect(status()).not.toHaveTextContent('revision 7')
  })
})

describe('submit, review and revise', () => {
  async function completeRecord(user) {
    const long = 'A clear, bounded statement for the plan.'
    for (const f of [/Bounded research question/, /Model/, /Uncertainty/, /Justified improvement/]) type(plan(f), long)
    for (const label of [/^My teacher has approved the specific light source/, /^The beam path is enclosed/, /^Shiny objects/, /^The source is switched off/, /^Only the supplied power adapter/]) await user.click(screen.getByLabelText(label))
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: /Add this result to the data table/ }))
  }

  it('lists exactly what is missing and does not submit an incomplete record', async () => {
    const w = setup()
    const { user } = await open(w)
    type(plan('Bounded research question'), 'Only a short start here, really')
    await user.click(screen.getByRole('button', { name: 'Submit for review' }))
    await user.click(screen.getByRole('button', { name: 'Yes, submit' }))
    const problems = await screen.findByText('Before you can submit:')
    const list = problems.closest('div')
    expect(within(list).getByText(/Confirm every safety item \(5 left\)/)).toBeInTheDocument()
    expect(within(list).getByText(/“model”/)).toBeInTheDocument()
    expect(within(list).getByText(/at least 3 data rows/)).toBeInTheDocument()
    expect([...w.collection.docs.values()][0].status).toBe('draft')
  })

  it('submits a complete record, locks editing, then supports teacher feedback and a revision', async () => {
    const w = setup()
    const { user } = await open(w)
    await completeRecord(user)
    await user.click(screen.getByRole('button', { name: 'Submit for review' }))
    expect(screen.getByText(/You cannot edit it until your teacher accepts it/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yes, submit' }))
    await waitFor(() => expect(screen.getByText(/Submitted\. Your teacher will accept it or ask for a revision/)).toBeInTheDocument())
    expect(status()).toHaveTextContent('Submitted for review')
    expect(plan('Bounded research question')).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeDisabled()
    expect(screen.getByText('No feedback yet.')).toBeInTheDocument()
    const stored = [...w.collection.docs.values()][0]
    expect(stored).toMatchObject({ status: 'submitted' })
    expect(stored.submissions).toHaveLength(1)

    // Teacher returns it with scores and a comment (through the real API).
    w.session.userId = 'teacher-1'
    const t = await api(w, 'teacher-1', handleRecordsGet, 'GET', `/api/research-projects/records?slug=${SLUG}&classId=class-a&scope=group:g1`)
    const returned = await api(w, 'teacher-1', handleActionsPost, 'POST', '/api/research-projects/actions', {
      slug: SLUG, viewer: t.body.viewer, action: 'feedback', outcome: 'revision', classId: 'class-a', scope: 'group:g1',
      reviewRevision: t.body.record.reviewRevision, baseRevision: t.body.record.revision, rubric: { uncertainty: 1 }, comment: 'Quantify the uncertainty in z before resubmitting.',
    })
    expect(returned.status).toBe(200)

    // The student reloads: feedback, rubric score and edit rights are back.
    cleanup()
    const again = await open(w)
    expect(await screen.findByText('Quantify the uncertainty in z before resubmitting.')).toBeInTheDocument()
    expect(screen.getByText(/Rubric scores: uncertainty 1\/4/)).toBeInTheDocument()
    expect(status()).toHaveTextContent('Revision requested')
    expect(screen.getByText(/Your teacher asked for a revision/)).toBeInTheDocument()
    expect(plan('Uncertainty')).not.toHaveAttribute('readonly')
    type(plan('Uncertainty'), 'Reading uncertainty of 0.5 mm plus the scatter of five repeats')
    await again.user.click(screen.getByRole('button', { name: 'Resubmit for review' }))
    await again.user.click(screen.getByRole('button', { name: 'Yes, submit' }))
    await waitFor(() => expect(status()).toHaveTextContent('Submitted for review'))
    expect([...w.collection.docs.values()][0].submissions).toHaveLength(2)
  })
})

describe('answer key policy in the student view', () => {
  it('shows no key control until the teacher releases it, then fetches it on demand with auto-checking', async () => {
    const w = setup()
    const { user } = await open(w)
    expect(screen.queryByRole('button', { name: /answer key/i })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Marking points|Correct option/)
    const { PROJECTS } = await import('@/lib/researchProjects/content')
    expect(PROJECTS.length).toBe(7)

    // Make the record complete, submitted and released through the API as a teacher would.
    await teammateSave(w, 'stu-a1', fullDoc(project, { answers: { q1: { choice: 'c' }, q4: { value: '0.2835' } } }))
    const open1 = await api(w, 'stu-a1', handleRecordsGet, 'GET', `/api/research-projects/records?slug=${SLUG}`)
    await api(w, 'stu-a1', handleActionsPost, 'POST', '/api/research-projects/actions', { slug: SLUG, viewer: open1.body.viewer, action: 'submit', baseRevision: open1.body.record.revision })
    const t = await api(w, 'teacher-1', handleRecordsGet, 'GET', `/api/research-projects/records?slug=${SLUG}&classId=class-a&scope=group:g1`)
    const rel = await api(w, 'teacher-1', handleActionsPost, 'POST', '/api/research-projects/actions', { slug: SLUG, viewer: t.body.viewer, action: 'release_keys', released: true, classId: 'class-a', scope: 'group:g1', reviewRevision: t.body.record.reviewRevision })
    expect(rel.status).toBe(200)

    cleanup()
    const again = await open(w)
    expect(await screen.findByText(/released the answer key for your team/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Marking points|Correct option/)
    await again.user.click(screen.getByRole('button', { name: 'Show answer key' }))
    expect((await screen.findAllByText(/Correct option:/)).length).toBe(2)
    expect(screen.getAllByText('Matches the key').length).toBe(2)
    expect(screen.getAllByText(/Marking points:/).length).toBe(4)
    await again.user.click(screen.getByRole('button', { name: 'Hide answer key' }))
    expect(screen.queryByText(/Correct option:/)).not.toBeInTheDocument()
  })
})

describe('picking up teacher actions while the page stays open', () => {
  it('unlocks measured rows after the teacher approves safety, when the student returns to the tab', async () => {
    const w = setup()
    const { user } = await open(w)
    await user.click(screen.getByRole('button', { name: /Add this result to the data table/ }))
    await user.click(within(status()).getByRole('button', { name: 'Save now' }))
    await waitFor(() => expect(status()).toHaveTextContent('revision 1'))
    expect(screen.getByRole('button', { name: 'Add a measured row' })).toBeDisabled()

    const t = await api(w, 'teacher-1', handleRecordsGet, 'GET', `/api/research-projects/records?slug=${SLUG}&classId=class-a&scope=group:g1`)
    await api(w, 'teacher-1', handleActionsPost, 'POST', '/api/research-projects/actions', { slug: SLUG, viewer: t.body.viewer, action: 'safety_review', approved: true, classId: 'class-a', scope: 'group:g1', reviewRevision: t.body.record.reviewRevision })

    await act(async () => { window.dispatchEvent(new Event('focus')) })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add a measured row' })).toBeEnabled())
    expect(screen.queryByText(/Measured rows unlock after your teacher/)).not.toBeInTheDocument()
  })

  it('never replaces unsaved typing when the tab regains focus', async () => {
    const w = setup()
    await open(w)
    type(plan('Model'), 'Typed but not yet saved')
    const before = w.calls.length
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(w.calls.length).toBe(before)
    expect(plan('Model')).toHaveValue('Typed but not yet saved')
  })
})
