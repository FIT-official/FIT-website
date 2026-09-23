import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), connect: vi.fn(), preflight: vi.fn(),
    retrieve: vi.fn(), privateBucket: vi.fn(), database: {} }));
vi.mock('@clerk/nextjs/server', () => ({ auth: m.auth }));
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: m.admin }));
vi.mock('@/lib/db', () => ({ connectToDatabase: m.connect }));
vi.mock('@/lib/checkoutTransactionReadiness', () => ({ verifyCheckoutTransactions: m.preflight }));
vi.mock('@/lib/fabrication/serverAssets', () => ({ privateFabricationBucket: m.privateBucket }));
vi.mock('stripe', () => ({ default: class { prices = { retrieve: m.retrieve }; } }));
import { GET } from '@/app/api/admin/store-readiness/route';

const ids = { standard: 'price_standard', standardYearly: 'price_standard_year', pro: 'price_pro', proYearly: 'price_pro_year' };
const env = { standard: 'STRIPE_STANDARD_MONTHLY_PRICE_ID', standardYearly: 'STRIPE_STANDARD_YEARLY_PRICE_ID',
    pro: 'STRIPE_PRO_MONTHLY_PRICE_ID', proYearly: 'STRIPE_PRO_YEARLY_PRICE_ID' };
const amounts = { standard: 3900, standardYearly: 39000, pro: 9900, proYearly: 99000 };
const validPrice = key => ({ id: ids[key], active: true, currency: 'sgd', unit_amount: amounts[key],
    recurring: { interval: key.endsWith('Yearly') ? 'year' : 'month', interval_count: 1, usage_type: 'licensed' },
    billing_scheme: 'per_unit', product: { id: 'prod_secret', active: true } });
const req = () => new Request('https://fit.test/api/admin/store-readiness');

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_never_return');
    vi.stubEnv('FABRICATION_S3_BUCKET_NAME', 'private-bucket-never-return');
    for (const key of Object.keys(ids)) vi.stubEnv(env[key], ids[key]);
    m.auth.mockResolvedValue({ userId: 'admin' });
    m.admin.mockResolvedValue(true);
    m.connect.mockResolvedValue(m.database);
    m.preflight.mockResolvedValue();
    m.privateBucket.mockResolvedValue('private-bucket-never-return');
    m.retrieve.mockImplementation(async id => validPrice(Object.keys(ids).find(key => ids[key] === id)));
});
afterEach(() => vi.unstubAllEnvs());

function expectNoProbes() {
    expect(m.connect).not.toHaveBeenCalled();
    expect(m.preflight).not.toHaveBeenCalled();
    expect(m.retrieve).not.toHaveBeenCalled();
    expect(m.privateBucket).not.toHaveBeenCalled();
}

describe('Admin store readiness', () => {
    it('rejects unauthenticated requests before any integration is probed', async () => {
        m.auth.mockResolvedValue({ userId: null });
        const response = await GET(req());
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ ready: false, code: 'unauthorized' });
        expect(m.admin).not.toHaveBeenCalled();
        expectNoProbes();
    });
    it('rejects non-admin users before any integration is probed', async () => {
        m.admin.mockResolvedValue(false);
        const response = await GET(req());
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ ready: false, code: 'forbidden' });
        expect(m.admin).toHaveBeenCalledWith('admin');
        expectNoProbes();
    });
    it('fails closed if authentication cannot be checked', async () => {
        m.auth.mockRejectedValueOnce(new Error('private auth credentials'));
        const response = await GET(req());
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ ready: false, code: 'authorization_unavailable' });
        expectNoProbes();
    });
    it('checks a fresh database transaction, all four exact Stripe variants, and private storage', async () => {
        const response = await GET(req());
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await response.json()).toEqual({ ready: true,
            checkoutTransactions: { ready: true, code: 'ready' },
            subscriptionPrices: Object.fromEntries(Object.keys(ids).map(key => [key, { ready: true, code: 'ready' }])),
            fabricationStorage: { ready: true, code: 'ready' } });
        expect(m.preflight).toHaveBeenCalledWith(m.database, { force: true });
        expect(m.retrieve).toHaveBeenCalledTimes(4);
        for (const id of Object.values(ids)) expect(m.retrieve).toHaveBeenCalledWith(id, { expand: ['product'] });
        expect(m.privateBucket).toHaveBeenCalledWith();
    });
    it('reports safe actionable codes for missing optional integrations without hiding checkout readiness', async () => {
        for (const key of Object.keys(ids)) vi.stubEnv(env[key], '');
        vi.stubEnv('FABRICATION_S3_BUCKET_NAME', '');
        const body = await (await GET(req())).json();
        expect(body.ready).toBe(false);
        expect(body.checkoutTransactions.ready).toBe(true);
        expect(Object.values(body.subscriptionPrices).every(price => price.code === 'price_not_configured')).toBe(true);
        expect(body.fabricationStorage).toEqual({ ready: false, code: 'fabrication_storage_not_configured' });
        expect(m.retrieve).not.toHaveBeenCalled();
        expect(m.privateBucket).not.toHaveBeenCalled();
    });
    it('does not expose database, Stripe or storage errors, secrets, or identifiers', async () => {
        const sensitive = 'mongodb://password@host/private?access_key=secret';
        m.preflight.mockRejectedValueOnce(new Error(sensitive));
        m.retrieve.mockRejectedValue(new Error(sensitive));
        m.privateBucket.mockRejectedValueOnce(new Error(sensitive));
        const response = await GET(req());
        expect(await response.json()).toEqual({ ready: false,
            checkoutTransactions: { ready: false, code: 'checkout_transaction_unavailable' },
            subscriptionPrices: Object.fromEntries(Object.keys(ids).map(key => [key, { ready: false, code: 'price_unavailable' }])),
            fabricationStorage: { ready: false, code: 'fabrication_storage_unverified' } });
    });
    it('continues price and bucket checks if the database cannot connect', async () => {
        m.connect.mockRejectedValueOnce(new Error('private connection string'));
        const body = await (await GET(req())).json();
        expect(body.checkoutTransactions.code).toBe('checkout_transaction_unavailable');
        expect(body.subscriptionPrices.proYearly.ready).toBe(true);
        expect(body.fabricationStorage.ready).toBe(true);
        expect(m.preflight).not.toHaveBeenCalled();
    });
    it('reports a missing Stripe key without attempting price reads', async () => {
        vi.stubEnv('STRIPE_SECRET_KEY', '');
        const body = await (await GET(req())).json();
        expect(Object.values(body.subscriptionPrices).every(price => price.code === 'stripe_not_configured')).toBe(true);
        expect(m.retrieve).not.toHaveBeenCalled();
    });
    it('rejects duplicate price mappings before a provider lookup', async () => {
        vi.stubEnv(env.pro, ids.standard);
        const body = await (await GET(req())).json();
        expect(body.subscriptionPrices.standard.code).toBe('price_invalid');
        expect(body.subscriptionPrices.pro.code).toBe('price_invalid');
        expect(m.retrieve).toHaveBeenCalledTimes(2);
        expect(m.retrieve).not.toHaveBeenCalledWith(ids.standard, expect.anything());
    });
    it.each([
        { unit_amount: 3900 }, { currency: 'usd' }, { active: false },
        { recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } },
        { recurring: { interval: 'year', interval_count: 2, usage_type: 'licensed' } },
        { recurring: { interval: 'year', interval_count: 1, usage_type: 'metered' } },
        { product: { active: false } }, { id: 'price_other' },
    ])('rejects a configured annual price with mismatched terms %j', async change => {
        m.retrieve.mockImplementation(async id => ({ ...validPrice(Object.keys(ids).find(key => ids[key] === id)),
            ...(id === ids.standardYearly ? change : {}) }));
        const body = await (await GET(req())).json();
        expect(body.subscriptionPrices.standardYearly).toEqual({ ready: false, code: 'price_invalid' });
        expect(body.subscriptionPrices.standard.ready).toBe(true);
        expect(body.ready).toBe(false);
    });
});
