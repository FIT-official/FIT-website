// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ jobs: [], subs: [], printers: [], audits: [], role: 'owner', userId: 'user_A', db: vi.fn(), mail: vi.fn() }));
function matches(row, query) {
    return Object.entries(query).every(([key, value]) => {
        const got = key.split('.').reduce((obj, part) => obj?.[part], row);
        if (value?.$in) return value.$in.includes(got);
        if (value?.$nin) return !value.$nin.includes(got);
        return got === value;
    });
}
function chain(get) {
    let sort = {}, limit = 200;
    const api = { select: () => api, sort: value => { sort = value; return api; }, limit: value => { limit = value; return api; }, session: () => api,
        lean: async () => { const rows = get(); return Array.isArray(rows) ? structuredClone(rows.sort((a, b) => {
            for (const [key, direction] of Object.entries(sort)) if (a[key] !== b[key]) return (a[key] > b[key] ? 1 : -1) * direction;
            return 0;
        }).slice(0, limit)) : structuredClone(rows); } };
    return api;
}
function update(rows, filter, changes) {
    const row = rows.find(row => matches(row, filter)); if (!row) return null;
    Object.assign(row, changes.$set); if (changes.$push?.statusHistory) row.statusHistory.push(changes.$push.statusHistory); return row;
}
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: f.userId }), clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: { role: f.role } }) } }) }));
vi.mock('@/lib/db', () => ({ connectToDatabase: f.db }));
vi.mock('@/models/PrintJob', () => ({ default: {
    createCollection: async () => {}, createIndexes: async () => {},
    find: query => chain(() => f.jobs.filter(row => matches(row, query))), findById: id => chain(() => f.jobs.find(row => row._id === id)),
    findOne: query => chain(() => f.jobs.find(row => matches(row, query))),
    findOneAndUpdate: (filter, changes) => chain(() => update(f.jobs, filter, changes)),
    exists: query => ({ session: async () => f.jobs.some(row => matches(row, query)) }),
    create: async input => { const rows = (Array.isArray(input) ? input : [input]).map((row, i) => ({ _id: String(f.jobs.length + i + 1).padStart(24, '0'), ...row })); f.jobs.push(...rows); return Array.isArray(input) ? rows : rows[0]; },
    bulkWrite: async ops => { for (const op of ops) update(f.jobs, op.updateOne.filter, op.updateOne.update); },
} }));
vi.mock('@/models/SubOrder', () => ({ default: {
    find: query => chain(() => f.subs.filter(row => matches(row, query))),
    findOneAndUpdate: (filter, changes) => chain(() => update(f.subs, filter, changes)),
} }));
vi.mock('@/models/Order', () => ({ default: { findById: () => chain(() => ({ customerEmail: 'fixittoday.contact@gmail.com' })) } }));
vi.mock('@/lib/email', () => ({ sendEmail: f.mail }));
vi.mock('@/models/Printer', () => ({ default: {
    find: query => chain(() => f.printers.filter(row => matches(row, query))),
    findOne: query => chain(() => f.printers.find(row => matches(row, query))),
} }));
vi.mock('@/models/AuditLog', () => ({ default: { findOne: query => chain(() => f.audits.find(row => matches(row, query))) } }));
import { GET, POST } from '@/app/api/creator-dashboard/queue/route';
import { PATCH, GET as readJob } from '@/app/api/creator-dashboard/queue/[id]/route';
import { GET as printers } from '@/app/api/creator-dashboard/printers/route';
import { GET as printer } from '@/app/api/creator-dashboard/printers/[id]/route';
import { GET as payouts } from '@/app/api/creator-dashboard/payouts/route';
const id = '000000000000000000000001';
const request = input => new Request('https://fit.test/api/creator-dashboard/queue', { method: 'POST', body: JSON.stringify(input) });
const patch = input => PATCH(request(input), { params: Promise.resolve({ id }) });
beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'true'); vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'false');
    vi.stubEnv('GMAIL_USER', 'fixittoday.contact@gmail.com'); vi.stubEnv('ADMIN_EMAIL', 'fixittoday.contact@gmail.com'); vi.stubEnv('GMAIL_PASSWORD', 'dummy-test-value');
    f.role = 'owner'; f.userId = 'user_A';
    f.printers = [{ _id: 'manual-p1s-01', storeId: 'user_A', mode: 'manual', name: 'P1S-01', status: 'idle' },
        { _id: 'printer-B', storeId: 'user_B', mode: 'bambu_lan', name: 'Private B', status: 'idle' }];
    f.audits = [];
    f.jobs = [{ _id: id, name: 'Model', qty: 1, storeId: 'user_A', source: { type: 'creator', refId: 'sub-A' }, priority: 0, position: 0, status: 'queued', statusHistory: [], attempt: 0 }];
    f.subs = [{ _id: 'sub-A', orderId: 'order', storeId: 'user_A', status: 'paid', statusHistory: [] }];
    f.db.mockResolvedValue({ startSession: async () => ({ withTransaction: async callback => {
        const snapshot = structuredClone({ jobs: f.jobs, subs: f.subs });
        try { await callback(); } catch (error) { f.jobs = snapshot.jobs; f.subs = snapshot.subs; throw error; }
    }, endSession: vi.fn() }) });
});
it('cannot set printing without a printer (400)', async () => {
    expect((await patch({ status: 'printing' })).status).toBe(400); expect(f.jobs[0].status).toBe('queued');
});
it('manual assignment becomes assigned and appears with the mocked printer list', async () => {
    expect((await patch({ printerId: 'manual-p1s-01' })).status).toBe(200);
    const data = await (await GET()).json(); expect(data.jobs[0]).toMatchObject({ status: 'assigned', printerId: 'manual-p1s-01' });
    expect(data.printers.find(p => p._id === data.jobs[0].printerId).mode).toBe('manual');
});
it('printing updates linked sub-order; done after QC moves it to qc with one email per change', async () => {
    await patch({ printerId: 'manual-p1s-01' }); await patch({ status: 'printing' });
    expect(f.subs[0].status).toBe('in_production'); expect(f.mail).toHaveBeenCalledTimes(1);
    await patch({ status: 'qc' }); await patch({ status: 'done' });
    expect(f.subs[0].status).toBe('qc'); expect(f.mail).toHaveBeenCalledTimes(2);
    await patch({ status: 'done' }); expect(f.mail).toHaveBeenCalledTimes(2);
});
it('failed makes one queued reprint while preserving the failed job and history', async () => {
    await patch({ printerId: 'manual-p1s-01' }); await patch({ status: 'failed', reason: 'Poor adhesion' });
    expect(f.jobs).toHaveLength(2); expect(f.jobs[0].statusHistory.at(-1)).toMatchObject({ status: 'failed', note: 'Poor adhesion' });
    expect(f.jobs[1]).toMatchObject({ reprintOf: id, status: 'queued', attempt: 1 }); expect(f.jobs[1].printerId).toBeUndefined();
    await patch({ status: 'failed', reason: 'Poor adhesion' }); expect(f.jobs).toHaveLength(2);
});
it('owner creates only a queued manual job even if paid is supplied', async () => {
    expect((await POST(request({ name: 'Fixture jig', qty: 2, status: 'paid', priority: 2, dueAt: '2026-10-12' }))).status).toBe(201);
    expect(f.jobs[1]).toMatchObject({ status: 'queued', priority: 2, storeId: 'user_A' });
});
it('creators list only their own queue and fleet even with a forged storeId', async () => {
    f.role = 'creator';
    f.jobs.push({ ...f.jobs[0], _id: 'other', storeId: 'user_B' });
    const req = new Request('https://fit.test/api/creator-dashboard/queue?storeId=user_B');
    const data = await (await GET(req)).json(); expect(data.jobs).toHaveLength(1); expect(data.printers).toHaveLength(1);
    expect(data.printers[0].storeId).toBe('user_A');
    expect((await (await printers(req)).json()).printers.map(p => p.storeId)).toEqual(['user_A']);
});
it('creator can create, assign and update own jobs but cannot choose their store from input', async () => {
    f.role = 'creator';
    expect((await POST(request({ name: 'Own jig', qty: 1, storeId: 'user_B' }))).status).toBe(201);
    expect(f.jobs[1].storeId).toBe('user_A');
    expect((await patch({ printerId: 'manual-p1s-01' })).status).toBe(200);
    expect((await patch({ status: 'printing' })).status).toBe(200);
    expect((await readJob(request({}), { params: Promise.resolve({ id }) })).status).toBe(200);
});
it('creator A cannot read or assign B jobs and printers by ID', async () => {
    f.role = 'creator';
    const otherId = '000000000000000000000002';
    f.jobs.push({ ...f.jobs[0], _id: otherId, storeId: 'user_B' });
    expect((await readJob(request({}), { params: Promise.resolve({ id: otherId }) })).status).toBe(403);
    expect((await PATCH(request({ printerId: 'manual-p1s-01' }), { params: Promise.resolve({ id: otherId }) })).status).toBe(403);
    expect((await printer(request({}), { params: Promise.resolve({ id: 'printer-B' }) })).status).toBe(403);
    expect((await patch({ printerId: 'printer-B' })).status).toBe(403);
    expect(f.jobs.every(job => job.status === 'queued')).toBe(true);
});
it('owner assignment is also restricted to a printer of the job store', async () => {
    expect((await patch({ printerId: 'printer-B' })).status).toBe(403);
    expect(f.jobs[0].printerId).toBeUndefined();
});
it('printing revalidates existing printer ownership and rejects unowned printer records', async () => {
    f.jobs[0].status = 'assigned'; f.jobs[0].printerId = 'printer-B';
    expect((await patch({ status: 'printing' })).status).toBe(403);
    delete f.printers[0].storeId;
    expect((await patch({ printerId: 'manual-p1s-01' })).status).toBe(403);
});
it('owner sees all stores and can filter queue and fleet only through their audited view', async () => {
    f.jobs.push({ ...f.jobs[0], _id: 'other', storeId: 'user_B' });
    expect((await (await GET()).json()).jobs).toHaveLength(2);
    const viewId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    f.audits.push({ _id: viewId, actorId: 'user_A', action: 'view_as_creator', storeId: 'user_B' });
    const req = new Request(`https://fit.test/api/creator-dashboard/queue?viewId=${viewId}`);
    const data = await (await GET(req)).json(); expect(data.jobs.map(job => job.storeId)).toEqual(['user_B']);
    expect((await (await printers(req)).json()).printers.map(p => p.storeId)).toEqual(['user_B']);
    f.audits[0].actorId = 'another-owner'; expect((await GET(req)).status).toBe(403); expect((await printers(req)).status).toBe(403);
});
it('reordering never changes positions in another store', async () => {
    f.role = 'creator';
    f.jobs.push({ ...f.jobs[0], _id: 'other', storeId: 'user_B', position: 1 }, { ...f.jobs[0], _id: 'own', position: 2 });
    expect((await patch({ direction: 'down' })).status).toBe(200);
    expect(f.jobs.find(job => job._id === 'other').position).toBe(1);
    expect(f.jobs.find(job => job._id === 'own').position).toBe(0);
});
it.each(['customer', 'staff'])('%s cannot access or mutate queue or fleet', async role => {
    f.role = role;
    expect((await GET()).status).toBe(403); expect((await patch({})).status).toBe(403);
    expect((await printers(request({}))).status).toBe(403); expect(f.db).not.toHaveBeenCalled();
});
it('payout summary is creator scoped, owner filter is audited, and staff cannot read fees', async () => {
    f.subs = ['user_A', 'user_B'].map((storeId, n) => ({ _id: `sub-${n}`, storeId, status: 'paid', items: [{ name: 'Print', qty: 1, unitAmountCents: 1000 }] }));
    const req = new Request('https://fit.test/api/creator-dashboard/payouts?storeId=user_B');
    f.role = 'creator'; expect((await (await payouts(req)).json()).rows.map(row => row.storeId)).toEqual(['user_A']);
    f.role = 'owner'; expect((await (await payouts(req)).json()).totals.grossCents).toBe(2000);
    f.audits.push({ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', actorId: 'user_A', action: 'view_as_creator', storeId: 'user_B' });
    const view = new Request('https://fit.test/api/creator-dashboard/payouts?viewId=aaaaaaaaaaaaaaaaaaaaaaaa');
    expect((await (await payouts(view)).json()).rows.map(row => row.storeId)).toEqual(['user_B']);
    f.role = 'staff'; expect((await payouts(req)).status).toBe(403);
    vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'false'); expect((await payouts(req)).status).toBe(404);
});
it('priority/due date and reorder are persisted', async () => {
    f.jobs.push({ ...f.jobs[0], _id: '000000000000000000000002', position: 1 });
    expect((await patch({ direction: 'down' })).status).toBe(200); expect(f.jobs[0].position).toBe(1); expect(f.jobs[1].position).toBe(0);
    await patch({ priority: 3, dueAt: '2026-10-12T04:00:00Z' }); expect(f.jobs[0].priority).toBe(3); expect(f.jobs[0].dueAt).toBeInstanceOf(Date);
});
it('200 jobs list API responds in under 2 seconds with an in-memory repository', async () => {
    f.jobs = Array.from({ length: 200 }, (_, n) => ({ ...f.jobs[0], _id: String(n).padStart(24, '0'), position: n }));
    const start = performance.now(), response = await GET(), data = await response.json();
    expect(response.status).toBe(200); expect(data.jobs).toHaveLength(200); expect(performance.now() - start).toBeLessThan(2000);
});
it('flag off prevents queue reads and writes before DB', async () => {
    vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'false'); expect((await GET()).status).toBe(404); expect((await POST(request({}))).status).toBe(404); expect((await patch({})).status).toBe(404); expect(f.db).not.toHaveBeenCalled();
});
