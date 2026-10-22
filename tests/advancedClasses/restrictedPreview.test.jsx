import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RestrictedPreview from '@/components/AdvancedClasses/RestrictedPreview'
import { CONTACT_EMAIL, RESTRICTED_NOTICE } from '@/lib/advancedClasses/config'

const root = process.cwd()
const ownedFiles = (dir) => readdirSync(join(root, dir)).map((name) => [name, readFileSync(join(root, dir, name), 'utf8')])

describe('RestrictedPreview', () => {
  it('shows the exact notice, a useful mailto and the sign-in link back to /class/projects', () => {
    render(<RestrictedPreview />)
    expect(RESTRICTED_NOTICE).toBe('Access restricted. Please email us to enquire about access.')
    expect(screen.getByText(RESTRICTED_NOTICE)).toBeInTheDocument()
    const mail = screen.getByRole('link', { name: /fixittoday\.contact@gmail\.com/ })
    expect(mail.getAttribute('href')).toMatch(/^mailto:fixittoday\.contact@gmail\.com\?subject=/)
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in?redirect_url=%2Fclass%2Fprojects')
    expect(screen.getByRole('heading', { level: 1, name: 'Advanced Classes' })).toBeInTheDocument()
  })

  it('keeps generic decoration aria-hidden with no text, links or focusable controls', () => {
    const { container } = render(<RestrictedPreview />)
    const hidden = container.querySelector('[aria-hidden="true"]')
    expect(hidden).not.toBeNull()
    expect(hidden.textContent).toBe('')
    expect(hidden.querySelectorAll('a, button, input, select, textarea, [tabindex]').length).toBe(0)
    expect(hidden.contains(screen.getByText(RESTRICTED_NOTICE))).toBe(false)
    expect(hidden.contains(screen.getByRole('link', { name: 'Sign in' }))).toBe(false)
  })

  it('exposes no lesson text, answer keys, ids or emails other than the public contact', () => {
    const { container } = render(<RestrictedPreview />)
    const html = container.innerHTML
    expect(html).not.toMatch(/user_[A-Za-z0-9]/)
    expect(html).not.toMatch(/answer|lesson|source|record|workspace|ac-m-/i)
    const emails = html.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []
    expect(new Set(emails)).toEqual(new Set([CONTACT_EMAIL]))
  })

  it('is keyboard reachable in reading order: contact, then sign in', async () => {
    const user = userEvent.setup()
    render(<RestrictedPreview />)
    await user.tab()
    expect(screen.getByRole('link', { name: /fixittoday/ })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveFocus()
    expect(within(document.body).getAllByRole('link')).toHaveLength(2)
  })

  it('keeps blur on the backdrop only and gives the notice an opaque dark-on-white surface with focus styles', () => {
    const css = readFileSync(join(root, 'components/AdvancedClasses/RestrictedPreview.module.css'), 'utf8')
    const block = (name) => css.match(new RegExp(`\\.${name}\\s*\\{[^}]*\\}`))?.[0] || ''
    expect(block('backdrop')).toMatch(/filter:\s*blur\(/)
    expect(block('backdrop')).toMatch(/pointer-events:\s*none/)
    expect(block('notice')).not.toMatch(/blur|opacity/)
    expect(block('notice')).toMatch(/background:\s*#fff/)
    expect(block('notice')).toMatch(/color:\s*#111/)
    expect(css).toMatch(/:focus-visible/)
    expect(css).toMatch(/@media \(max-width: 30rem\)/)
  })
})

describe('client bundle hygiene', () => {
  it('no component or public config imports server-only bindings or contains owner identities', () => {
    const files = [...ownedFiles('components/AdvancedClasses'), ['config.js', readFileSync(join(root, 'lib/advancedClasses/config.js'), 'utf8')]]
    for (const [name, text] of files) {
      expect(text, name).not.toMatch(/bindings\.server|defaults\.server|researchProjects|answerKeys/)
      expect(text, name).not.toMatch(/user_[A-Za-z0-9]{10,}|lwwenwei/)
    }
  })

  it('server-only files mark themselves server-only', () => {
    for (const name of ['bindings.server.js', 'defaults.server.js']) {
      expect(readFileSync(join(root, 'lib/advancedClasses', name), 'utf8').startsWith("import 'server-only'")).toBe(true)
    }
  })
})
