import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const f = vi.hoisted(() => ({ auth: vi.fn(), getUser: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({ auth: f.auth, clerkClient: async () => ({ users: { getUser: f.getUser } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), notFound: () => { throw new Error('404'); }, redirect: () => { throw new Error('redirect'); } }));
vi.mock('@/lib/db', () => ({ connectToDatabase: () => { throw new Error('Fixture must never access DB'); } }));
import OrdersView from '@/components/CreatorDashboard/OrdersView';
import TrackingView from '@/components/CreatorDashboard/TrackingView';
import UploadsView from '@/components/CreatorDashboard/UploadsView';
import QueueView from '@/components/CreatorDashboard/QueueView';
import { fixtureOrders, fixtureJobs, manualPrinters, fixtureToken } from '@/lib/creatorDashboard/fixtures';
import { trackingProjection } from '@/lib/creatorDashboard/orderStatus';
import { pageScope } from '@/lib/creatorDashboard/pages';
import { fixtureMode } from '@/lib/creatorDashboard/flags';
import OwnerPage from '@/app/admin/creator-dashboard/page';
import OrdersPage from '@/app/dashboard/creator/orders/page';
import UploadPage from '@/app/dashboard/creator/uploads/page';
import QueuePage from '@/app/admin/creator-dashboard/queue/page';
import TrackPage from '@/app/track/[token]/page';
beforeEach(() => {
    vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn()); vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'true'); vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'true');
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('VERCEL_ENV', 'preview');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('creator fixture orders display only their own store, with no fleet or stock', async () => {
    render(await OrdersPage());
    expect(screen.getByText('Dragon keychain')).toBeInTheDocument(); expect(screen.queryByText('Ribbed planter')).not.toBeInTheDocument();
    expect(screen.queryByText('Printer fleet')).not.toBeInTheDocument(); expect(screen.queryByRole('link', { name: 'Materials' })).not.toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
});
it('all fixture page entrypoints render without auth, DB, Stripe or Sheet access', async () => {
    for (const page of [OwnerPage, OrdersPage, UploadPage, QueuePage, () => TrackPage({ params: Promise.resolve({ token: fixtureToken }) })]) {
        const html = renderToStaticMarkup(await page()); expect(html).toContain('Demo workspace');
    }
    expect(f.auth).not.toHaveBeenCalled(); expect(f.getUser).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it('fixture mode is ignored in production and only exact true enables flags', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('VERCEL_ENV', 'production'); expect(fixtureMode()).toBe(false);
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
it('exports five static fixture surfaces for optional local screenshot capture', () => {
    const dir = process.env.CREATOR_SCREENSHOT_DIR; if (!dir) return;
    mkdirSync(dir, { recursive: true });
    const css = readFileSync(resolve('components/CreatorDashboard/dashboard.css'), 'utf8');
    const views = {
        'owner-dashboard': <OrdersView initialOrders={fixtureOrders} owner fixture overview overviewData={{ jobs: fixtureJobs, printers: manualPrinters }} />,
        'creator-orders': <OrdersView initialOrders={fixtureOrders.filter(order => order.storeId === 'user_demo_maker')} fixture />,
        'track': <TrackingView orders={trackingProjection([fixtureOrders[0]])} fixture />,
        'upload-validation': <UploadsView fixture storageLabel="storage: mock — needs Chairman approval for private bucket" initialError="File exceeds its size limit. STL and 3MF files must be 100 MB or smaller." />,
        'print-queue': <QueueView initialJobs={fixtureJobs} printers={manualPrinters} fixture />,
    };
    for (const [name, view] of Object.entries(views)) writeFileSync(join(dir, `${name}.html`), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;padding:20px;background:#e8eee8}main{max-width:1440px} ${css}</style></head><body>${renderToStaticMarkup(view)}</body></html>`);
    expect(Object.keys(views)).toHaveLength(5);
});
