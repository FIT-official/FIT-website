import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatLauncher from '@/components/Chat/ChatLauncher'

vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: null, isLoaded: true }) }))
const route = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }))
const getInstance = vi.hoisted(() => vi.fn())
vi.mock('stream-chat', () => ({ StreamChat: { getInstance } }))
afterEach(() => { cleanup(); document.getElementById('main-content')?.remove(); route.pathname = '/'; vi.unstubAllGlobals(); vi.clearAllMocks() })

it('keeps a named keyboard control and anonymous open/close behavior without connecting or sending', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(<ChatLauncher />)
    const launcher = screen.getByRole('button', { name: 'Chat with us', exact: true })
    expect(launcher).toHaveAttribute('title', 'Chat with us')
    launcher.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Close', exact: true })).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById('fit-chat-panel')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Close chat', exact: true }))
    expect(screen.getByRole('button', { name: 'Chat with us', exact: true })).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById('fit-chat-panel')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    expect(getInstance).not.toHaveBeenCalled()
})

it.each(['/classes/simulations', '/classes/simulations/sampling', '/simulations/feedback'])(
    'places chat after page content on %s for the mobile flow layout', async pathname => {
        route.pathname = pathname
        const main = document.createElement('main')
        main.id = 'main-content'
        const plot = document.createElement('svg')
        main.append(plot)
        document.body.append(main)
        const fetch = vi.fn()
        vi.stubGlobal('fetch', fetch)
        const user = userEvent.setup()
        render(<ChatLauncher />)
        const launcher = screen.getByRole('button', { name: 'Chat with us', exact: true })
        expect(launcher.parentElement).toBe(main)
        expect(main.lastElementChild).toBe(launcher)
        expect(launcher.className).toContain('simulationLauncher')
        launcher.focus()
        await user.keyboard('{Enter}')
        expect(document.getElementById('fit-chat-panel')).not.toBeNull()
        await user.click(screen.getByRole('button', { name: 'Close chat', exact: true }))
        expect(document.getElementById('fit-chat-panel')).toBeNull()
        expect(fetch).not.toHaveBeenCalled()
        expect(getInstance).not.toHaveBeenCalled()
    },
)

it.each(['/', '/shop', '/classes', '/classes/simulations-extra', '/simulations', '/simulations-extra/sampling'])(
    'keeps the original launcher placement on %s', pathname => {
        route.pathname = pathname
        const main = document.createElement('main')
        main.id = 'main-content'
        document.body.append(main)
        const { container } = render(<ChatLauncher />)
        const launcher = screen.getByRole('button', { name: 'Chat with us', exact: true })
        expect(launcher.parentElement).toBe(container)
        expect(launcher.className).not.toContain('simulationLauncher')
        expect(launcher.className).not.toContain('simulationPending')
        expect(main.childElementCount).toBe(0)
    },
)

it('moves the launcher back when leaving simulations and finds a replaced page host', () => {
    route.pathname = '/classes/simulations/sampling'
    const main = document.createElement('main')
    main.id = 'main-content'
    document.body.append(main)
    const { container, rerender } = render(<ChatLauncher />)
    expect(main).toContainElement(screen.getByRole('button', { name: 'Chat with us', exact: true }))
    route.pathname = '/shop'
    rerender(<ChatLauncher />)
    expect(container).toContainElement(screen.getByRole('button', { name: 'Chat with us', exact: true }))
    expect(main.childElementCount).toBe(0)
    main.remove()
    const nextMain = document.createElement('main')
    nextMain.id = 'main-content'
    document.body.append(nextMain)
    route.pathname = '/classes/simulations/heat-path'
    rerender(<ChatLauncher />)
    expect(nextMain).toContainElement(screen.getByRole('button', { name: 'Chat with us', exact: true }))
})
