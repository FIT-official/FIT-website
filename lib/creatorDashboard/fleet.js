import Printer from '@/models/Printer';
import { scopeQueryForStore } from '@/lib/auth/scope';
import { DashboardError, requireDashboard } from './flags';
import { createPrinterAdapter } from './printerAdapters';
import { PrinterError } from './printerAdapters/errors';

export async function fleetCard(printer) {
    // Explicit projection: no future connection credentials or arbitrary telemetry
    // fields can accidentally leave the server through a model's toJSON().
    const card = { _id: String(printer._id), storeId: printer.storeId, name: printer.name, model: printer.model,
        nozzleMm: printer.nozzleMm, mode: printer.mode, source: printer.mode === 'mock' ? 'Mock telemetry' : printer.mode === 'manual' ? 'Manual status' : 'FIT Bridge · outbound WSS' };
    try {
        const adapter = createPrinterAdapter(printer);
        return { ...card, capabilities: adapter.getCapabilities(), telemetry: (await adapter.getStatus()).value };
    } catch (error) {
        if (!(error instanceof PrinterError)) throw error;
        return { ...card, telemetry: { state: 'OFFLINE', errors: [error.toJSON()], progress: {}, temps: { nozzles: [] } } };
    }
}
export async function listPrinters(scope) {
    requireDashboard();
    const rows = await Printer.find(scopeQueryForStore(scope)).sort({ name: 1 }).limit(200).lean();
    return Promise.all(rows.map(fleetCard));
}
export async function readPrinter(scope, id, session) {
    requireDashboard();
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new DashboardError('Forbidden', 403);
    let query = Printer.findOne(scopeQueryForStore(scope, { _id: id }));
    if (session) query = query.session(session);
    const printer = await query.lean();
    if (!printer?.storeId) throw new DashboardError('Forbidden', 403);
    return printer;
}
