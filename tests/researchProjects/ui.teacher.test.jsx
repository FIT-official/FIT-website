// @vitest-environment jsdom
// Teacher review UI against the REAL route handlers (via a fake fetch). SYNTHETIC accounts and classes.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitFor, fireEvent, act, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectWorkspace from '@/components/ResearchProjects/ProjectWorkspace'
import { getProject } from '@/lib/researchProjects/content'
import { handleRecordsGet, handleRecordsPut, handleActionsPost, handleKeysGet } from '@/lib/researchProjects/http'
import { createWorld, WORLD_MEMBERS, installFetch, viewerFor, fullDoc, SLUG, request, read } from './helpers'

// `server-only` throws outside a server bundle. This narrow mock lets server modules load under test.
vi.mock('server-only', () => ({}))

const project = getProject(SLUG)
const RECORDS = `/api/research-projects/records?slug=${SLUG}`

function setup(options = {}) {
  const w = createWorld({ members: WORLD_MEMBERS, ...options })
  installFetch(w)
  return w
}

async function as(w, userId, handler, method, path, body) {
  const before = w.session.userId
  w.session.userId = userId
  const response = await handler(request(method, path, { body }), w.deps)
  w.session.userId = before
  return read(response)
}

async function studentSave(w, userId, doc) {
  const open = await as(w, userId, handleRecordsGet, 'GET', RECORDS)
  return as(w, userId, handleRecordsPut, 'PUT', '/api/research-projects/records', { slug: SLUG, viewer: open.body.viewer, baseRevision: open.body.record.revision, doc })
}
async function studentSubmit(w, userId) {
  const open = await as(w, userId, handleRecordsGet, 'GET', RECORDS)
  return as(w, userId, handleActionsPost, 'POST', '/api/research-projects/actions', { slug: SLUG, viewer: open.body.viewer, action: 'submit', baseRevision: open.body.record.revision })
}

async function openTeacher(w, classIds = ['class-a']) {
  const viewer = await viewerFor(w, 'teacher-1')
  const utils = render(<ProjectWorkspace project={project} canReview viewer={viewer} classIds={classIds} />)
  return { ...utils, viewer, user: userEvent.setup() }
}

const long = 'A clear, bounded statement for the plan.'

beforeEach(() => { window.localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('teacher with no class attached (the real activation state)', () => {
  it('explains that student access is off, and offers keys only on request', async () => {
    const w = setup({ attached: [] })
    const { user } = await openTeacher(w, [])
    expect(await screen.findByText(/No class is attached to this library yet, so student access is switched off/)).toBeInTheDocument()
    expect(screen.getByText(/reviewed class membership mapping/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Marking points|Correct option/)
    await user.click(screen.getByRole('button', { name: 'Show answer key in questions' }))
    expect((await screen.findAllByText(/Correct option:/)).length).toBe(2)
    expect(screen.getAllByText(/Marking points:/).length).toBe(4)
    expect(screen.getAllByText(/Expected value:/).length).toBe(2)
    expect(screen.queryByText('Matches the key')).not.toBeInTheDocument()
    expect(w.collection.docs.size).toBe(0)
  })

  it('shows the content read-only: nothing a teacher sees can be typed into, ticked or recorded', async () => {
    const w = setup({ attached: [] })
    const { container } = await openTeacher(w, [])
    await screen.findByText(/No class is attached/)
    const boxes = [...container.querySelectorAll('textarea, input[type="checkbox"], input[type="radio"]')]
    expect(boxes.length).toBeGreaterThan(20)
    for (const el of boxes) expect(el.readOnly || el.matches(':disabled'), el.outerHTML.slice(0, 80)).toBe(true)
    expect(screen.getByRole('button', { name: /Add this result to the data table/ })).toBeDisabled()
    expect(screen.getByText(/Teachers preview the simulation/)).toBeInTheDocument()
  })
})

describe('teacher review of team records', () => {
  async function seed(w) {
    await studentSave(w, 'stu-a1', fullDoc(project, { answers: { q1: { choice: 'c' }, q2: { choice: 'a' }, q4: { value: '0.2835' } } }))
    await studentSave(w, 'stu-a3', fullDoc(project, { plan: { question: 'Group two question statement', model: '', dataPlan: '', uncertainty: '', improvement: '' }, todo: {} }))
  }

  it('lists the teams in an attached class and opens a record read-only', async () => {
    const w = setup()
    await seed(w)
    const { user } = await openTeacher(w)
    const table = await screen.findByRole('region', { name: 'Teams' })
    const g1 = within(table).getByText('Group g1').closest('tr')
    const g2 = within(table).getByText('Group g2').closest('tr')
    expect(within(g1).getByText('Draft')).toBeInTheDocument()
    expect(within(g1).getByText(`5/${project.todo.length}`)).toBeInTheDocument()
    expect(within(g2).getByText(`0/${project.todo.length}`)).toBeInTheDocument()
    await user.click(within(g2).getByRole('button', { name: 'Open Group g2' }))
    await screen.findByText(/Group g2 · Draft · revision 1/)
    expect(screen.getByRole('textbox', { name: 'Bounded research question' })).toHaveValue('Group two question statement')
    expect(screen.getByRole('textbox', { name: 'Bounded research question' })).toHaveAttribute('readonly')
    // Group one's private work is not shown while group two is open.
    expect(document.body.textContent).not.toContain('A clear, bounded statement for the plan.')
  })

  it('records the safety review and holds the answer key until the team has submitted', async () => {
    const w = setup()
    await seed(w)
    const { user } = await openTeacher(w)
    await user.click(await screen.findByRole('button', { name: 'Open Group g1' }))
    await screen.findByText(/Group g1 · Draft/)
    const release = screen.getByRole('button', { name: 'Release answer key to this team' })
    expect(release).toBeDisabled()
    expect(screen.getByText(/held; it can be released after the first submission/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Record safety review: approved' }))
    await screen.findByRole('button', { name: 'Withdraw safety review' })
    expect(screen.getByText(/approved, so measured rows can be recorded/)).toBeInTheDocument()
    expect([...w.collection.docs.values()].find(d => d.scope === 'group:g1').safetyReview.approved).toBe(true)

    await studentSubmit(w, 'stu-a1')
    // Re-open to pick up the submission, then release.
    await user.click(screen.getByRole('button', { name: 'Open Group g1' }))
    await screen.findByText(/Group g1 · Submitted for review/)
    await user.click(screen.getByRole('button', { name: 'Release answer key to this team' }))
    await screen.findByRole('button', { name: 'Withdraw answer key from this team' })
    expect(screen.getByText(/released to this team/)).toBeInTheDocument()
    expect([...w.collection.docs.values()].find(d => d.scope === 'group:g1').keyRelease.released).toBe(true)
  })

  it('sends rubric feedback, returns work for revision, and shows the history', async () => {
    const w = setup()
    await seed(w)
    await studentSubmit(w, 'stu-a1')
    const { user } = await openTeacher(w)
    await user.click(await screen.findByRole('button', { name: 'Open Group g1' }))
    await screen.findByText(/Group g1 · Submitted for review/)
    await user.click(screen.getByLabelText(/Return for revision/))
    await user.selectOptions(screen.getByRole('combobox', { name: /^Uncertainty/ }), '1')
    await user.selectOptions(screen.getByRole('combobox', { name: /^Bounded research question/ }), '3')
    fireEvent.change(screen.getByRole('textbox', { name: 'Comment for the team' }), { target: { value: 'Quantify the uncertainty in z.' } })
    await user.click(screen.getByRole('button', { name: 'Send feedback' }))
    await screen.findByText(/Group g1 · Revision requested/)
    expect(screen.getByText('Quantify the uncertainty in z.')).toBeInTheDocument()
    const stored = [...w.collection.docs.values()].find(d => d.scope === 'group:g1')
    expect(stored.status).toBe('revision_requested')
    expect(stored.feedback[0]).toMatchObject({ kind: 'revision', rubric: { uncertainty: 1, question: 3 }, comment: 'Quantify the uncertainty in z.' })
    expect(screen.getAllByText(/ · submitted · /).length).toBeGreaterThan(0)
    expect(screen.getByText(/ · revision requested · Teacher/)).toBeInTheDocument()
  })

  it('blocks return-for-revision on an unsubmitted record in the form itself', async () => {
    const w = setup()
    await seed(w)
    const { user } = await openTeacher(w)
    await user.click(await screen.findByRole('button', { name: 'Open Group g2' }))
    await screen.findByText(/Group g2 · Draft/)
    expect(screen.getByLabelText(/Return for revision/)).toBeDisabled()
    expect(screen.getByLabelText(/^Accept/)).toBeDisabled()
    expect(screen.getByText(/needs a submitted record/)).toBeInTheDocument()
  })

  it('checks a team’s answers against the key only after the teacher asks, and clears it when another team is opened', async () => {
    const w = setup()
    await seed(w)
    const { user } = await openTeacher(w)
    await user.click(await screen.findByRole('button', { name: 'Open Group g1' }))
    await screen.findByText(/Group g1 · Draft/)
    await user.click(screen.getByRole('button', { name: 'Show answer key in questions' }))
    await waitFor(() => expect(screen.getAllByText('Matches the key').length).toBe(2))
    expect(screen.getAllByText('Does not match the key').length).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Open Group g2' }))
    await screen.findByText(/Group g2 · Draft/)
    expect(screen.queryByText('Matches the key')).not.toBeInTheDocument()
    expect(screen.queryByText(/Marking points/)).not.toBeInTheDocument()
  })

  it('reloads and says so when another teacher changed the record first', async () => {
    const w = setup()
    await seed(w)
    const { user } = await openTeacher(w)
    await user.click(await screen.findByRole('button', { name: 'Open Group g1' }))
    await screen.findByText(/Group g1 · Draft/)
    // A second teacher approves the safety review while this teacher is still looking at old data.
    const open = await as(w, 'teacher-1', handleRecordsGet, 'GET', `${RECORDS}&classId=class-a&scope=group:g1`)
    await as(w, 'teacher-1', handleActionsPost, 'POST', '/api/research-projects/actions', { slug: SLUG, viewer: open.body.viewer, action: 'safety_review', approved: true, classId: 'class-a', scope: 'group:g1', reviewRevision: open.body.record.reviewRevision })
    await user.click(screen.getByRole('button', { name: 'Record safety review: approved' }))
    await screen.findByText(/changed while you were reviewing/)
    expect(screen.getByRole('button', { name: 'Withdraw safety review' })).toBeInTheDocument()
  })

  it('shows only the team that was opened last when two opens overlap', async () => {
    const w = setup()
    await seed(w)
    const { user } = await openTeacher(w)
    const table = await screen.findByRole('region', { name: 'Teams' })
    let release
    const gate = new Promise(r => { release = r })
    let slowOnce = true
    w.hook = async (method, path, init) => {
      if (method === 'GET' && path.endsWith('/records') && slowOnce) {
        const url = w.calls[w.calls.length - 1]
        if (url.search.includes('scope=group%3Ag1')) { slowOnce = false; await gate }
      }
      return undefined
    }
    await user.click(within(table).getByRole('button', { name: 'Open Group g1' }))
    await user.click(within(table).getByRole('button', { name: 'Open Group g2' }))
    await screen.findByText(/Group g2 · Draft/)
    release()
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(screen.getByText(/Group g2 · Draft/)).toBeInTheDocument()
    expect(screen.queryByText(/Group g1 · Draft/)).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Bounded research question' })).toHaveValue('Group two question statement')
  })

  it('stops reading class data when the signed-in account is no longer the teacher', async () => {
    const w = setup()
    await seed(w)
    const { viewer } = await openTeacher(w)
    await screen.findByRole('region', { name: 'Teams' })
    cleanup()
    w.session.userId = 'stu-a1' // another tab: a student signs in
    render(<ProjectWorkspace project={project} canReview viewer={viewer} classIds={['class-a']} />)
    expect(await screen.findByText(/Review access required./)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Teams' })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Group g1')
  })
})
