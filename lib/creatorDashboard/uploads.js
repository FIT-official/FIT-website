import { ensureDashboardIndexes } from './modelSetup';
import { randomUUID } from 'node:crypto';
import { scopeQueryForStore } from '@/lib/auth/scope';
import { DashboardError, requireDashboard } from './flags';
import { dashboardDb } from './http';
import { validateUploadRequest, validateUploadBytes, CONSENT_VERSION, MB } from './uploadValidation';
import { uploadStorage, mockUploadState, uploadPost, readQuarantine, promoteClean, downloadTicket, MOCK_MAX_BYTES } from './uploadStorage';

export const uploadProjection = record => Object.fromEntries(['uploadId', 'jobId', 'filename', 'ext', 'sizeBytes', 'scanStatus', 'scanEngine', 'bbox', 'volumeCm3', 'needsConversion', 'ipConsent', 'deleteAfter'].map(key => [key, record[key]]));
function cleanMock() {
    for (const [id, record] of mockUploadState.records) if (new Date(record.deleteAfter).getTime() < Date.now()) {
        mockUploadState.records.delete(id); mockUploadState.objects.delete(record.s3Key); if (record.thumbKey) mockUploadState.objects.delete(record.thumbKey);
    }
    for (const [ticket, data] of mockUploadState.tickets) if (data.expiresAt < Date.now()) mockUploadState.tickets.delete(ticket);
}
function uploadQuery(scope, query = {}) {
    return scope.role === 'creator' ? scopeQueryForStore(scope, { ...query, ownerId: scope.userId }) : scope.role === 'owner' ? query : { ...query, ownerId: scope.userId };
}
export async function reserveUploads(scope, input) {
    requireDashboard({ write: true });
    const files = validateUploadRequest(input), storage = await uploadStorage();
    const jobId = input.jobId || randomUUID();
    if (!/^[a-f0-9-]{36}$/.test(jobId)) throw new DashboardError('Invalid job ID');
    const now = new Date(), bytes = files.reduce((n, file) => n + file.sizeBytes, 0);
    const records = files.map(file => { const uploadId = randomUUID(); return { ...file, uploadId, jobId,
        ownerType: scope.role === 'customer' ? 'customer' : 'creator', ownerId: scope.userId, storeId: scope.storeId,
        bucket: storage.bucket, s3Key: `creator-uploads/quarantine/${uploadId}`, scanStatus: 'pending', processing: false,
        ipConsent: { at: now, version: CONSENT_VERSION }, deleteAfter: new Date(now.getTime() + 7 * 86400000) }; });
    if (storage.mode === 'mock') {
        cleanMock();
        if (mockUploadState.records.size + files.length > 1000) throw new DashboardError('Mock storage is full', 503);
        if (files.some(file => file.sizeBytes > MOCK_MAX_BYTES)) throw new DashboardError('Mock storage accepts files up to 3 MB; larger files need approved private storage', 413);
        const existing = [...mockUploadState.records.values()].filter(record => record.jobId === jobId);
        if (existing.some(record => record.ownerId !== scope.userId)) throw new DashboardError('Forbidden', 403);
        validateUploadRequest(input, { count: existing.length, bytes: existing.reduce((sum, file) => sum + file.sizeBytes, 0) });
        for (const record of records) mockUploadState.records.set(record.uploadId, record);
    } else {
        const database = await dashboardDb();
        const { default: Upload } = await import('@/models/Upload');
        const { default: UploadBatch } = await import('@/models/UploadBatch');
        await ensureDashboardIndexes([Upload, UploadBatch]);
        const session = await database.startSession();
        try {
            await session.withTransaction(async () => {
                if (!input.jobId) await UploadBatch.create([{ _id: jobId, ownerId: scope.userId }], { session });
                const batch = await UploadBatch.findOneAndUpdate({ _id: jobId, ownerId: scope.userId, count: { $lte: 10 - files.length }, bytes: { $lte: 300 * MB - bytes } },
                    { $inc: { count: files.length, bytes } }, { session, new: true });
                if (!batch) throw new DashboardError('Job limit exceeded or job not owned by this account', 403);
                await Upload.create(records, { session });
            });
        } finally { await session.endSession(); }
    }
    return { storage: storage.mode, storageLabel: storage.label, jobId,
        uploads: await Promise.all(records.map(async record => ({ ...uploadProjection(record), post: await uploadPost(storage, record) }))) };
}
export async function ownedUpload(scope, uploadId, storage) {
    if (!/^[a-f0-9-]{36}$/.test(uploadId || '')) throw new DashboardError('Forbidden', 403);
    let record;
    if (storage.mode === 'mock') { cleanMock(); record = mockUploadState.records.get(uploadId); }
    else { await dashboardDb(); const { default: Upload } = await import('@/models/Upload'); record = await Upload.findOne(uploadQuery(scope, { uploadId })).lean(); }
    if (!record || (scope.role !== 'owner' && record.ownerId !== scope.userId)) throw new DashboardError('Forbidden', 403);
    if (new Date(record.deleteAfter).getTime() <= Date.now()) throw new DashboardError('File expired', 410);
    return record;
}
export async function listUploads(scope) {
    const storage = await uploadStorage(); let records;
    if (storage.mode === 'mock') { cleanMock(); records = [...mockUploadState.records.values()].filter(record => scope.role === 'owner' || record.ownerId === scope.userId); }
    else { await dashboardDb(); const { default: Upload } = await import('@/models/Upload'); records = await Upload.find(uploadQuery(scope)).sort({ createdAt: -1 }).limit(100).lean(); }
    return { storage: storage.mode, storageLabel: storage.label, uploads: records.map(uploadProjection) };
}
export async function completeUpload(scope, uploadId) {
    requireDashboard({ write: true });
    const storage = await uploadStorage(), record = await ownedUpload(scope, uploadId, storage);
    if (record.scanStatus !== 'pending') return { upload: uploadProjection(record), storageLabel: storage.label };
    let Upload;
    if (storage.mode === 'mock') {
        if (record.processing) throw new DashboardError('File is being checked', 409);
        record.processing = true;
    } else {
        Upload = (await import('@/models/Upload')).default;
        if (!await Upload.findOneAndUpdate(uploadQuery(scope, { uploadId, scanStatus: 'pending', processing: false }), { $set: { processing: true } })) throw new DashboardError('File is being checked', 409);
    }
    let validation, clean = {};
    try {
        const { bytes, etag } = await readQuarantine(storage, record);
        validation = validateUploadBytes(bytes, record);
        if (validation.scanStatus === 'clean') clean = await promoteClean(storage, record, validation, etag);
    } catch (error) { validation = { scanStatus: 'error', error: error.status ? error.message : 'File could not be validated' }; }
    const { thumbnail, error, ...persisted } = validation;
    const update = { ...persisted, ...clean, processing: false,
        ...(validation.scanStatus === 'clean' ? { deleteAfter: new Date(Date.now() + 30 * 86400000) } : {}) };
    if (storage.mode === 'mock') Object.assign(record, update);
    else await Upload.updateOne({ uploadId, processing: true }, { $set: update });
    return { upload: uploadProjection({ ...record, ...update }), ...(error ? { validationError: error } : {}), storageLabel: storage.label };
}
export async function issueDownload(scope, uploadId, thumbnail = false) {
    const storage = await uploadStorage(), record = await ownedUpload(scope, uploadId, storage);
    return { ...await downloadTicket(storage, record, thumbnail), storageLabel: storage.label };
}
