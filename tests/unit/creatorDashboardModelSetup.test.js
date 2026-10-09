// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import AuditLog from '@/models/AuditLog';
import SubOrder from '@/models/SubOrder';
import ProcessedStripeEvent from '@/models/ProcessedStripeEvent';
import PrintJob from '@/models/PrintJob';
import Printer from '@/models/Printer';
import Upload from '@/models/Upload';
import UploadBatch from '@/models/UploadBatch';
import Order from '@/models/Order';
import { ensureDashboardIndexes } from '@/lib/creatorDashboard/modelSetup';
beforeEach(() => { vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'true'); vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'false'); });
it('new model imports cannot automatically create collections or indexes', () => {
    for (const model of [AuditLog, SubOrder, ProcessedStripeEvent, PrintJob, Printer, Upload, UploadBatch]) {
        expect(model.schema.options.autoCreate).toBe(false); expect(model.schema.options.autoIndex).toBe(false);
    }
    expect(Order.schema.indexes().some(([keys]) => keys.trackingToken)).toBe(false);
});
it('index preparation requires the write gate and runs once per model', async () => {
    const model = { createCollection: vi.fn(async () => {}), createIndexes: vi.fn(async () => {}) };
    vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'false'); await expect(ensureDashboardIndexes([model])).rejects.toMatchObject({ status: 404 });
    expect(model.createCollection).not.toHaveBeenCalled(); expect(model.createIndexes).not.toHaveBeenCalled();
    vi.stubEnv('CREATOR_DASHBOARD_ENABLED', 'true'); vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'true'); await expect(ensureDashboardIndexes([model])).rejects.toMatchObject({ status: 409 });
    vi.stubEnv('CREATOR_DASHBOARD_FIXTURES', 'false'); await Promise.all([ensureDashboardIndexes([model]), ensureDashboardIndexes([model])]);
    expect(model.createCollection).toHaveBeenCalledTimes(1); expect(model.createIndexes).toHaveBeenCalledTimes(1);
});
