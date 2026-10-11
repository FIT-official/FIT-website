import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatLauncher from '@/components/Chat/ChatLauncher'

vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: null, isLoaded: true }) }))
const getInstance = vi.hoisted(() => vi.fn())
vi.mock('stream-chat', () => ({ StreamChat: { getInstance } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

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
