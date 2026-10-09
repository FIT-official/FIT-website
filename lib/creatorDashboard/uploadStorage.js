import { randomBytes } from 'node:crypto';
import { GetObjectCommand, HeadObjectCommand, CopyObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DashboardError, requireDashboard } from './flags';
import { createUploadPost } from './postPolicy';
import { MB } from './uploadValidation';
export const MOCK_LABEL = 'storage: mock — needs Chairman approval for private bucket';
export const MOCK_MAX_BYTES = 3 * MB;
const memory = globalThis.__fitCreatorUploads ||= { records: new Map(), objects: new Map(), tickets: new Map() };
export const mockUploadState = memory;
export const mockAllowed = () => process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'preview';
export async function uploadStorage() {
    requireDashboard();
    if (process.env.FABRICATION_S3_BUCKET_NAME) {
        try {
            const { privateFabricationBucket } = await import('@/lib/fabrication/serverAssets');
            const bucket = await privateFabricationBucket();
            const { s3 } = await import('@/lib/s3');
            return { mode: 's3', label: 'storage: private fabrication bucket', bucket, s3 };
        } catch { /* Fail closed to preview-only mock, never to the public bucket. */ }
    }
    if (!mockAllowed()) throw new DashboardError('Verified private storage is unavailable', 503);
    return { mode: 'mock', label: MOCK_LABEL, bucket: null };
}
export async function uploadPost(storage, record) {
    requireDashboard({ write: true });
    if (storage.mode === 'mock') return { url: `/api/creator-dashboard/uploads/${record.uploadId}/content`, fields: {},
        method: 'PUT', expiresIn: 600, maxBytes: MOCK_MAX_BYTES,
        conditions: [['content-length-range', 1, Math.min(record.sizeBytes, MOCK_MAX_BYTES)], { 'Content-Type': record.contentType }] };
    return createUploadPost({ bucket: storage.bucket, region: await storage.s3.config.region(), credentials: await storage.s3.config.credentials(), record });
}
export async function boundedBytes(stream, limit) {
    let length = 0; const chunks = [];
    for await (const chunk of stream) {
        length += chunk.length;
        if (length > limit) { stream.destroy?.(); throw new DashboardError('Upload exceeds its reserved size', 413); }
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}
export async function readQuarantine(storage, record) {
    if (!record.s3Key.startsWith('creator-uploads/quarantine/')) throw new DashboardError('Invalid quarantine key', 403);
    if (storage.mode === 'mock') {
        const body = memory.objects.get(record.s3Key);
        if (!body) throw new DashboardError('Mock file expired; upload again', 404);
        return { bytes: body, etag: null };
    }
    if (storage.bucket !== record.bucket) throw new DashboardError('Private storage is unavailable', 503);
    const head = await storage.s3.send(new HeadObjectCommand({ Bucket: storage.bucket, Key: record.s3Key }));
    if (head.ContentLength !== record.sizeBytes || head.ContentType !== record.contentType) throw new DashboardError('Stored file does not match its reservation', 413);
    const result = await storage.s3.send(new GetObjectCommand({ Bucket: storage.bucket, Key: record.s3Key, IfMatch: head.ETag }));
    return { bytes: await boundedBytes(result.Body, record.sizeBytes), etag: head.ETag };
}
export async function promoteClean(storage, record, validation, etag) {
    requireDashboard({ write: true });
    if (validation.scanStatus !== 'clean') throw new DashboardError('Unclean files cannot be promoted', 403);
    const key = `creator-uploads/clean/${record.uploadId}`;
    const thumbKey = validation.thumbnail ? `creator-uploads/clean/${record.uploadId}.png` : undefined;
    if (storage.mode === 'mock') {
        memory.objects.set(key, memory.objects.get(record.s3Key)); memory.objects.delete(record.s3Key);
        if (thumbKey) memory.objects.set(thumbKey, validation.thumbnail);
    } else {
        await storage.s3.send(new CopyObjectCommand({ Bucket: storage.bucket, Key: key,
            CopySource: `${storage.bucket}/${record.s3Key}`, CopySourceIfMatch: etag, ServerSideEncryption: 'AES256' }));
        if (thumbKey) await storage.s3.send(new PutObjectCommand({ Bucket: storage.bucket, Key: thumbKey, Body: validation.thumbnail, ContentType: 'image/png', ServerSideEncryption: 'AES256' }));
        await storage.s3.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: record.s3Key }));
    }
    return { s3Key: key, ...(thumbKey ? { thumbKey } : {}) };
}
export async function downloadTicket(storage, record, thumbnail = false) {
    if (record.scanStatus !== 'clean' || !record.s3Key.startsWith('creator-uploads/clean/')) throw new DashboardError('File is not cleared for download', 403);
    const key = thumbnail ? record.thumbKey : record.s3Key;
    if (!key) throw new DashboardError('Preview not available', 404);
    const expiresIn = 600;
    if (storage.mode === 'mock') {
        const ticket = randomBytes(16).toString('hex');
        memory.tickets.set(ticket, { key, ownerId: record.ownerId, uploadId: record.uploadId, expiresAt: Date.now() + expiresIn * 1000 });
        return { url: `/api/creator-dashboard/uploads/${record.uploadId}/content?ticket=${ticket}`, expiresIn };
    }
    if (storage.bucket !== record.bucket) throw new DashboardError('Private storage is unavailable', 503);
    const url = await getSignedUrl(storage.s3, new GetObjectCommand({ Bucket: storage.bucket, Key: key,
        ResponseContentType: thumbnail ? 'image/png' : 'application/octet-stream',
        ResponseContentDisposition: thumbnail ? 'inline' : `attachment; filename="${record.filename}"`, ResponseCacheControl: 'private, no-store' }), { expiresIn });
    return { url, expiresIn };
}
