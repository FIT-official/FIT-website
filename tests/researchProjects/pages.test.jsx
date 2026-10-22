// @vitest-environment jsdom
// Page-level gating for /class/projects and /class/projects/[slug], with SYNTHETIC accounts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PROJECTS, getProject } from '@/lib/researchProjects/content'
import { ANSWER_KEYS } from '@/lib/researchProjects/answerKeys'
import { createWorld, WORLD_MEMBERS, installFetch, SLUG } from './helpers'

const holder = vi.hoisted(() => ({ deps: null }))
vi.mock('@/lib/researchProjects/deps', () => ({ defaultDeps: () => holder.deps }))

import ProjectsPage from '@/app/class/projects/page'
import ProjectPage from '@/app/class/projects/[slug]/page'
import * as layout from '@/app/class/projects/layout'
import * as listPageModule from '@/app/class/projects/page'
import * as slugPageModule from '@/app/class/projects/[slug]/page'

let world
beforeEach(() => {
  world = createWorld({ members: WORLD_MEMBERS })
  installFetch(world)
  holder.deps = world.deps
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const renderList = async () => render(await ProjectsPage())
const renderProject = async slug => render(await ProjectPage({ params: Promise.resolve({ slug }) }))
const everyProjectText = () => PROJECTS.flatMap(p => [p.title, p.shortTitle, p.summary])

describe('signed out', () => {
  it('shows only a sign-in notice on the list page, with no project information', async () => {
    const { container } = await renderList()
    expect(screen.getByRole('heading', { name: 'Sign in to continue' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    for (const text of everyProjectText()) expect(container.textContent).not.toContain(text)
    expect(container.querySelectorAll('li').length).toBe(0)
  })

  it('shows the identical notice for a real slug and an invented one, so existence is not revealed', async () => {
    const real = await renderProject(SLUG)
    const realHtml = real.container.innerHTML
    cleanup()
    const fake = await renderProject('does-not-exist')
    expect(fake.container.innerHTML).toBe(realHtml)
    expect(fake.container.textContent).not.toContain(getProject(SLUG).title)
  })
})

describe('signed in but not a member', () => {
  it('shows a neutral denial on both pages and no content', async () => {
    world.session.userId = 'someone-with-a-clerk-login'
    const list = await renderList()
    expect(screen.getByRole('heading', { name: /not available for your account/ })).toBeInTheDocument()
    for (const text of everyProjectText()) expect(list.container.textContent).not.toContain(text)
    cleanup()
    const page = await renderProject(SLUG)
    expect(screen.getByRole('heading', { name: /not available for your account/ })).toBeInTheDocument()
    expect(page.container.textContent).not.toContain(getProject(SLUG).researchQuestion.slice(0, 30))
    expect(world.calls).toEqual([]) // the client workspace never mounted, so no API call was made
  })

  it('is denied when the class is not attached, even for a mapped student', async () => {
    const w = createWorld({ members: WORLD_MEMBERS, attached: [] })
    holder.deps = w.deps
    w.session.userId = 'stu-a1'
    await renderList()
    expect(screen.getByRole('heading', { name: /not available for your account/ })).toBeInTheDocument()
  })

  it('reports a temporary failure as unavailable, not as access', async () => {
    world.deps.isAdmin = async () => { throw new Error('clerk down') }
    world.session.userId = 'stu-a1'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await renderList()
    expect(screen.getByRole('heading', { name: /temporarily unavailable/ })).toBeInTheDocument()
  })
})

describe('authorised', () => {
  it('shows one tile per project for a member, with links and counts but no body content or keys', async () => {
    world.session.userId = 'stu-a1'
    const { container } = await renderList()
    expect(screen.getByRole('heading', { level: 1, name: 'Research projects' })).toBeInTheDocument()
    const links = screen.getAllByRole('link')
    expect(links.map(l => l.getAttribute('href')).sort()).toEqual(PROJECTS.map(p => '/class/projects/' + p.slug).sort())
    for (const p of PROJECTS) expect(screen.getByText(p.shortTitle)).toBeInTheDocument()
    expect(container.textContent).not.toContain(PROJECTS[0].researchQuestion.slice(0, 40))
    for (const key of Object.values(ANSWER_KEYS).flatMap(k => Object.values(k))) expect(container.textContent).not.toContain(key.why || key.working || (key.points || ['\u0000'])[0])
    expect(screen.queryByText(/Teacher view/)).not.toBeInTheDocument()
  })

  it('shows teachers the same tiles with a teacher note', async () => {
    world.session.userId = 'teacher-1'
    await renderList()
    expect(screen.getByText(/Teacher view: you can open any project/)).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(7)
  })

  it('opens a project for a member, wired to that member’s own scope', async () => {
    world.session.userId = 'stu-a1'
    await renderProject(SLUG)
    expect(screen.getByRole('heading', { level: 1, name: getProject(SLUG).title })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: /save status/i })).toBeInTheDocument()
    expect(world.calls[0]).toMatchObject({ method: 'GET', path: '/api/research-projects/records' })
    expect(world.calls[0].search).not.toMatch(/classId|scope/)
  })

  it('opens the teacher view for an admin and passes only the attached class ids', async () => {
    world.session.userId = 'teacher-1'
    await renderProject(SLUG)
    expect(await screen.findByRole('heading', { name: 'Teacher review' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Class' })).toHaveValue('class-a')
    expect([...screen.getByRole('combobox', { name: 'Class' }).options].map(o => o.value)).toEqual(['class-a'])
  })

  it('returns 404 for an unknown project, but only after access has passed', async () => {
    world.session.userId = 'stu-a1'
    await expect(ProjectPage({ params: Promise.resolve({ slug: 'no-such' }) })).rejects.toMatchObject({ digest: expect.stringContaining('404') })
    world.session.userId = null
    await expect(ProjectPage({ params: Promise.resolve({ slug: 'no-such' }) })).resolves.toBeTruthy()
  })
})

describe('no static generation, metadata or caching path', () => {
  it('forces dynamic rendering and noindex on everything under /class/projects', () => {
    expect(layout.dynamic).toBe('force-dynamic')
    expect(listPageModule.dynamic).toBe('force-dynamic')
    expect(slugPageModule.dynamic).toBe('force-dynamic')
    expect(layout.metadata.robots).toMatchObject({ index: false, follow: false, nocache: true, noarchive: true })
    for (const mod of [listPageModule, slugPageModule, layout]) {
      expect(mod.generateStaticParams).toBeUndefined()
      expect(mod.generateMetadata).toBeUndefined()
      expect(mod.revalidate).toBeUndefined()
    }
  })

  it('keeps project names and text out of metadata', () => {
    const meta = JSON.stringify(layout.metadata)
    for (const text of everyProjectText()) expect(meta).not.toContain(text)
    expect(meta).not.toMatch(/holography|levitat|radar|CanSat|ptychograph|Prandtl|localis/i)
  })
})
