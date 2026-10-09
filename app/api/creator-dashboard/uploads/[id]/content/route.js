import { requireScope } from '@/lib/auth/scope';
import { ownedUpload } from '@/lib/creatorDashboard/uploads';
import { boundedBytes, uploadStorage, mockUploadState, MOCK_MAX_BYTES } from '@/lib/creatorDashboard/uploadStorage';
import { dashboardJson, dashboardError } from '@/lib/creatorDashboard/http';
export async function PUT(req, { params }) {
    try {
        const scope = await requireScope(['owner', 'creator', 'customer'], { write: true });
        const storage = await uploadStorage(); if (storage.mode !== 'mock') return dashboardJson({ error: 'Use the private S3 POST' }, 400);
        const record = await ownedUpload(scope, (await params).id, storage);
        if (record.scanStatus !== 'pending' || record.processing) return dashboardJson({ error: 'Upload already submitted' }, 409);
        if (Date.now() > new Date(record.ipConsent.at).getTime() + 600000) return dashboardJson({ error: 'Upload reservation expired' }, 410);
        if (req.headers.get('content-type') !== record.contentType) return dashboardJson({ error: 'Content type mismatch' }, 400);
        const quarantineKey = record.s3Key;
        const bytes = await boundedBytes(req.body, Math.min(record.sizeBytes, MOCK_MAX_BYTES));
        if (bytes.length !== record.sizeBytes) return dashboardJson({ error: 'File size mismatch' }, 413);
        const total = [...mockUploadState.objects.values()].reduce((sum, body) => sum + body.length, 0);
        if (total + bytes.length > 64 * 1024 * 1024) return dashboardJson({ error: 'Mock storage is full' }, 503);
        if (record.scanStatus !== 'pending' || record.processing || record.s3Key !== quarantineKey) return dashboardJson({ error: 'Upload already submitted' }, 409);
        mockUploadState.objects.set(quarantineKey, bytes);
        return dashboardJson({ stored: true, storageLabel: storage.label });
    } catch (error) { return dashboardError(error); }
}
export async function GET(req, { params }) {
    try {
        const scope = await requireScope(['owner', 'creator', 'customer']);
        const storage = await uploadStorage(); if (storage.mode !== 'mock') return dashboardJson({ error: 'Not found' }, 404);
        const record = await ownedUpload(scope, (await params).id, storage);
        const ticket = mockUploadState.tickets.get(new URL(req.url).searchParams.get('ticket'));
        if (!ticket || ticket.uploadId !== record.uploadId || ticket.expiresAt <= Date.now() || record.scanStatus !== 'clean') return dashboardJson({ error: 'Download expired or unavailable' }, 403);
        const bytes = mockUploadState.objects.get(ticket.key);
        if (!bytes) return dashboardJson({ error: 'Mock file expired' }, 404);
        return new Response(bytes, { headers: { 'Content-Type': ticket.key.endsWith('.png') ? 'image/png' : 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${record.filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    } catch (error) { return dashboardError(error); }
}
