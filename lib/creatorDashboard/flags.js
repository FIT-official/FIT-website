// All switches are server-only and opt-in, including on Vercel preview.
export const dashboardEnabled = () => process.env.CREATOR_DASHBOARD_ENABLED === 'true';
export const fixtureMode = () => dashboardEnabled() && process.env.CREATOR_DASHBOARD_FIXTURES === 'true' &&
    (process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'preview');
export const testPaymentsEnabled = () => dashboardEnabled() && !fixtureMode() &&
    process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') === true;

export class DashboardError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}
export function requireDashboard({ write = false } = {}) {
    if (!dashboardEnabled()) throw new DashboardError('Not found', 404);
    if (write && fixtureMode()) throw new DashboardError('Fixture mode is read-only', 409);
}

export const dashboardEventEnabled = event => testPaymentsEnabled() && event?.livemode === false;
