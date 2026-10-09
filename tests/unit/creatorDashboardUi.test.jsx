import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
const f = vi.hoisted(() => ({ auth: vi.fn(), getUser: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({ auth: f.auth, clerkClient: async () => ({ users: { getUser: f.getUser } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), notFound: () => { throw new Error('404'); }, redirect: () => { throw new Error('redirect'); } }));
vi.mock('@/lib/db', () => ({ connectToDatabase: () => { throw new Error('Fixture must never access DB'); } }));
import UploadsView from '@/components/CreatorDashboard/UploadsView';
import QueueView from '@/components/CreatorDashboard/QueueView';
import { fixtureJobs, manualPrinters, fixtureToken } from '@/lib/creatorDashboard/fixtures';
import { pageScope } from '@/lib/creatorDashboard/pages';
import { fixtureMode } from '@/lib/creatorDashboard/flags';
import OwnerPage from '@/app/admin/creator-dashboard/page';
import OrdersPage from '@/app/dashboard/creator/orders/page';
import UploadPage from '@/app/dashboard/creator/uploads/page';
import QueuePage from '@/app/admin/creator-dashboard/queue/page';
import TrackPage from '@/app/track/[token]/page';
import FleetPage from '@/app/dashboard/creator/fleet/page';
import OwnerFleetPage from '@/app/admin/creator-dashboard/fleet/page';
import PayoutsPage from '@/app/dashboard/creator/payouts/page';
import OwnerPayoutsPage from '@/app/admin/creator-dashboard/payouts/page';
import JobPage from '@/app/dashboard/creator/jobs/page';
beforeEach(() => {
    vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn()); vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'true'); vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'true');
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('VERCEL_ENV', 'preview');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('creator fixture orders display only their own store with a fleet link but no stock', async () => {
    render(await OrdersPage());
    expect(screen.getByText('Dragon keychain')).toBeInTheDocument(); expect(screen.queryByText('Ribbed planter')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Printer fleet' })).toHaveAttribute('href', '/dashboard/creator/fleet'); expect(screen.queryByRole('link', { name: 'Materials' })).not.toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
});
it('all fixture page entrypoints render without auth, DB, Stripe or Sheet access', async () => {
    for (const page of [OwnerPage, OrdersPage, UploadPage, QueuePage, JobPage, FleetPage, OwnerFleetPage, PayoutsPage, OwnerPayoutsPage, () => TrackPage({ params: Promise.resolve({ token: fixtureToken }) })]) {
        const html = renderToStaticMarkup(await page()); expect(html).toContain('Demo workspace');
    }
    expect(f.auth).not.toHaveBeenCalled(); expect(f.getUser).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it('creator fleet displays all five adapter states and never another store printer', async () => {
    render(await FleetPage());
    for (const state of ['idle', 'printing', 'paused', 'error', 'offline']) expect(screen.getByText(state, { selector: '.cd-badge' })).toBeInTheDocument();
    expect(screen.getByText('42% complete')).toBeInTheDocument(); expect(screen.getByText('215 °C')).toBeInTheDocument();
    expect(screen.getByText('P1S-01', { selector: 'h3' }).closest('section')).toHaveTextContent('Dragon keychain');
    expect(screen.queryByText('Studio MK4S')).not.toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
});
it('owner fleet includes both read-only Bridge stubs and audited filter control', async () => {
    render(await OwnerFleetPage());
    expect(screen.getByText('Studio MK4S')).toBeInTheDocument(); expect(screen.getByText('Studio P1S')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View as creator' })).toBeDisabled();
});
it('creator queue offers its own assignments and excludes other stores', async () => {
    render(await JobPage());
    const assign = screen.getByRole('combobox', { name: 'Printer for Dragon keychain' });
    expect(within(assign).getByRole('option', { name: 'P1S-01' })).toBeInTheDocument();
    expect(screen.queryByText('Studio P1S')).not.toBeInTheDocument(); expect(screen.queryByText('Ribbed planter')).not.toBeInTheDocument();
});
it('payout pages show placeholder fees and scoped rows without any transfer action', async () => {
    render(await PayoutsPage());
    expect(screen.getByText(/PLACEHOLDER/)).toBeInTheDocument(); expect(screen.queryByText('Ribbed planter')).not.toBeInTheDocument();
    expect(screen.getAllByText('$62.00').length).toBeGreaterThan(0); expect(screen.queryByRole('button', { name: /pay|transfer|connect/i })).not.toBeInTheDocument();
    cleanup(); render(await OwnerPayoutsPage()); expect(screen.getByText('Ribbed planter')).toBeInTheDocument();
});
it('fixture mode is ignored in production and only exact true enables flags', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('VERCEL_ENV', 'production'); expect(fixtureMode()).toBe(false);
    vi.stubEnv('VERCEL_ENV', 'preview'); expect(fixtureMode()).toBe(false);
    f.auth.mockResolvedValue({ userId: null }); await expect(pageScope()).rejects.toThrow('redirect');
    vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'TRUE'); await expect(pageScope()).rejects.toThrow('404');
});
it('printer card shows assignment; fixture actions are disabled', () => {
    render(<QueueView initialJobs={fixtureJobs} printers={manualPrinters} fixture />);
    expect(screen.getByText('P1S-01', { selector: 'h3' }).closest('section')).toHaveTextContent('assigned');
    expect(screen.getByRole('button', { name: 'Add job' })).toBeDisabled(); expect(fetch).not.toHaveBeenCalled();
});
it('upload view displays mandatory ownership notice, mock warning and validation error', () => {
    render(<UploadsView fixture storageLabel="storage: mock — needs Chairman approval for private bucket" initialError="File exceeds its size limit" />);
    expect(screen.getByRole('checkbox')).not.toBeChecked(); expect(screen.getByRole('alert')).toHaveTextContent('size limit'); expect(screen.getByText(/needs Chairman approval/)).toBeInTheDocument();
});
