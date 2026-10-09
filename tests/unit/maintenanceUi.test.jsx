import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import MaintenanceBanner from '@/components/MaintenanceBanner'
import MaintenancePage, { metadata, dynamic } from '@/app/maintenance/page'
import { readMaintenanceConfig } from '@/lib/maintenance/config'

vi.mock('@/lib/maintenance/config', async original => ({ ...await original(), readMaintenanceConfig: vi.fn() }))
beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('renders no server banner or network-dependent placeholder', () => {
    vi.stubGlobal('fetch', vi.fn())
    expect(renderToStaticMarkup(<MaintenanceBanner />)).toBe('')
    expect(fetch).not.toHaveBeenCalled()
})
it('shows a wrapping, fixed notice with its SGT window and remembers dismissal for the session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ banner: { active: true, message: 'Shop updates tonight', window: 'Sat 10 Oct, 02:00–03:00 SGT' } }) }))
    const first = render(<MaintenanceBanner />)
    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('Shop updates tonight')
    expect(notice).toHaveTextContent('Sat 10 Oct, 02:00–03:00 SGT')
    expect(notice).toHaveClass('fixed', 'top-14')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss maintenance notice' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    first.unmount()
    render(<MaintenanceBanner />)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
it.each(['off', 'failure'])('stays silent and empty when %s', async mode => {
    const log = vi.spyOn(console, 'error')
    const fetchMock = mode === 'off' ? vi.fn().mockResolvedValue({ ok: true, json: async () => ({ banner: { active: false } }) }) : vi.fn().mockRejectedValue(new Error('Unavailable'))
    vi.stubGlobal('fetch', fetchMock)
    render(<MaintenanceBanner />)
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
})
it('renders the configured maintenance page and expected return time with noindex', async () => {
    readMaintenanceConfig.mockResolvedValue({ page: { enabled: true, title: 'Shop updates', message: 'We will be back soon.', until: '2099-10-10T03:00:00+08:00' } })
    const html = renderToStaticMarkup(await MaintenancePage())
    expect(html).toContain('Shop updates')
    expect(html).toContain('Expected back:')
    expect(html).toContain('03:00 SGT')
    expect(html).toContain('mailto:fixittoday.contact@gmail.com')
    expect(metadata.robots.index).toBe(false)
    expect(dynamic).toBe('force-dynamic')
})
it('shows normal operation and a home link when the flag is off', async () => {
    readMaintenanceConfig.mockResolvedValue({ page: { enabled: false, until: null } })
    const html = renderToStaticMarkup(await MaintenancePage())
    expect(html).toContain('The site is running normally')
    expect(html).toContain('href="/"')
    expect(html).not.toContain('Expected back:')
})
