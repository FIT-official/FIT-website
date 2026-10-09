// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn(), verify: vi.fn(), signedGet: vi.fn(), s3: { send: vi.fn(), config: {} } }));
vi.mock('@clerk/nextjs/server', () => ({ auth: f.auth, clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: { role: 'creator' } }) } }) }));
vi.mock('@/lib/db', () => ({ connectToDatabase: f.db }));
vi.mock('@/lib/fabrication/serverAssets', () => ({ privateFabricationBucket: f.verify }));
vi.mock('@/lib/s3', () => ({ s3: f.s3 }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: f.signedGet }));
import { POST as reserve } from '@/app/api/creator-dashboard/uploads/route';
import { POST as complete, GET as ticket } from '@/app/api/creator-dashboard/uploads/[id]/route';
import { PUT as transfer, GET as download } from '@/app/api/creator-dashboard/uploads/[id]/content/route';
import { mockUploadState, uploadStorage, downloadTicket, promoteClean } from '@/lib/creatorDashboard/uploadStorage';
const ascii = 'solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n';
const request = (body, method = 'POST') => new Request('https://fit.test/upload', { method, body: JSON.stringify(body) });
beforeEach(() => {
    vi.clearAllMocks(); vi.useRealTimers();
    vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'true'); vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'false'); vi.stubEnv('FABRICATION_S3_BUCKET_NAME', ''); vi.stubEnv('NODE_ENV', 'test');
    f.auth.mockResolvedValue({ userId: 'user_A' });
    mockUploadState.records.clear(); mockUploadState.objects.clear(); mockUploadState.tickets.clear();
});
async function upload(content = ascii) {
    const res = await reserve(request({ ipConsent: true, files: [{ filename: '../model.stl', sizeBytes: Buffer.byteLength(content) }] }));
    expect(res.status).toBe(201); const data = await res.json(), item = data.uploads[0], ctx = { params: Promise.resolve({ id: item.uploadId }) };
    const sent = await transfer(new Request('https://fit.test/content', { method: 'PUT', headers: { 'content-type': 'model/stl' }, body: content }), ctx);
    expect(sent.status).toBe(200);
    return { ctx, data, item };
}
it('consent is required before any reservation or DB call', async () => {
    expect((await reserve(request({ files: [{ filename: 'x.stl', sizeBytes: 3 }] }))).status).toBe(400);
    expect(mockUploadState.records.size).toBe(0); expect(f.db).not.toHaveBeenCalled();
});
it('mock upload is labelled, consent stored, names never become keys, no DB', async () => {
    const { data, item } = await upload();
    expect(data.storageLabel).toContain('needs Chairman approval');
    const row = mockUploadState.records.get(item.uploadId); expect(row.s3Key).toBe(`creator-uploads/quarantine/${item.uploadId}`);
    expect(row.ipConsent).toMatchObject({ version: '2026-10-10', at: expect.any(Date) }); expect(f.db).not.toHaveBeenCalled();
});
it('clean file issues <=600s GET after ownership check and expires', async () => {
    const { ctx, item } = await upload(); expect((await complete(null, ctx)).status).toBe(200);
    const row = mockUploadState.records.get(item.uploadId); expect(row.scanStatus).toBe('clean'); expect(row.s3Key).toContain('/clean/');
    const issued = await (await ticket(new Request('https://fit.test'), ctx)).json(); expect(issued.expiresIn).toBeLessThanOrEqual(600);
    expect((await download(new Request(`https://fit.test${issued.url}`), ctx)).status).toBe(200);
    f.auth.mockResolvedValue({ userId: 'user_B' }); expect((await ticket(new Request('https://fit.test'), ctx)).status).toBe(403);
    expect((await download(new Request(`https://fit.test${issued.url}`), ctx)).status).toBe(403);
    f.auth.mockResolvedValue({ userId: 'user_A' }); vi.useFakeTimers(); vi.setSystemTime(Date.now() + 601000);
    expect((await download(new Request(`https://fit.test${issued.url}`), ctx)).status).toBe(403); vi.useRealTimers();
});
it('EICAR stays infected in quarantine and never receives a download', async () => {
    const { ctx, item } = await upload('EICAR' + '-STANDARD-ANTIVIRUS-TEST-FILE'); await complete(null, ctx);
    const record = mockUploadState.records.get(item.uploadId); expect(record.scanStatus).toBe('infected'); expect(record.s3Key).toContain('/quarantine/');
    expect([...mockUploadState.objects.keys()].some(key => key.includes('/clean/'))).toBe(false);
    expect((await ticket(new Request('https://fit.test'), ctx)).status).toBe(403);
    await expect(promoteClean({ mode: 'mock' }, record, { scanStatus: 'infected' })).rejects.toMatchObject({ status: 403 });
});
it('cumulative reservations cannot bypass the ten-file job limit', async () => {
    const { data } = await upload();
    const files = Array.from({ length: 10 }, () => ({ filename: 'x.stl', sizeBytes: 1 }));
    expect((await reserve(request({ files, ipConsent: true, jobId: data.jobId }))).status).toBe(400);
});
it('flag off blocks all writes; fixtures never reach DB', async () => {
    vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'false'); expect((await reserve(request({}))).status).toBe(404);
    vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'true'); vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'true'); expect((await reserve(request({}))).status).toBe(409);
    expect(f.db).not.toHaveBeenCalled();
});
it('private adapter requires runtime BPA verification; never uses public-image bucket', async () => {
    vi.stubEnv('NEXT_PUBLIC_S3_BUCKET_NAME', 'public-fixture');
    expect((await uploadStorage()).mode).toBe('mock'); expect(f.verify).not.toHaveBeenCalled();
    vi.stubEnv('FABRICATION_S3_BUCKET_NAME', 'private-fixture'); f.verify.mockRejectedValue(new Error('Unverified'));
    expect((await uploadStorage()).mode).toBe('mock');
    f.verify.mockResolvedValue('private-fixture'); expect((await uploadStorage()).bucket).toBe('private-fixture');
    f.signedGet.mockResolvedValue('https://fixture.invalid/signed');
    await downloadTicket({ mode: 's3', bucket: 'private-fixture', s3: f.s3 }, { scanStatus: 'clean', s3Key: 'creator-uploads/clean/id', filename: 'a.stl', bucket: 'private-fixture' });
    expect(f.signedGet.mock.calls[0][2].expiresIn).toBe(600);
});
it('unverified storage is not mocked in production', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('VERCEL_ENV', 'production'); await expect(uploadStorage()).rejects.toMatchObject({ status: 503 });
});
