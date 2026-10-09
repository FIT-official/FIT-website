import { capabilityMatrix } from './capabilities';
import { PrinterCapabilityError, PrinterOfflineError, PrinterProtocolError, PrinterError } from './errors';

const STATES = ['IDLE', 'PREPARING', 'PRINTING', 'PAUSED', 'FINISHED', 'CANCELLED', 'ERROR', 'ATTENTION', 'OFFLINE', 'UNKNOWN'];
const fixtureTime = '2026-10-09T17:00:00Z';
export const mockStates = Object.freeze({
    idle: { percent: 0, timeRemainingSec: null, nozzleC: 25, bedC: 25 },
    printing: { percent: 42, timeRemainingSec: 3480, nozzleC: 215, bedC: 60 },
    paused: { percent: 58, timeRemainingSec: 1920, nozzleC: 170, bedC: 60 },
    error: { percent: 18, timeRemainingSec: null, nozzleC: 30, bedC: 28, errorCode: 'filament_runout' },
    offline: { percent: null, timeRemainingSec: null, nozzleC: null, bedC: null, errorCode: 'bridge_not_connected' },
});
function normalized(printer, message) {
    return { printerId: String(printer._id), state: message.state, vendorState: message.state.toLowerCase(),
        progress: { percent: message.percent ?? null, timeRemainingSec: message.timeRemainingSec ?? null,
            timeRemainingSource: message.timeRemainingSec == null ? 'none' : 'printer', elapsedSec: null, jobName: null },
        temps: { nozzles: [{ current: message.nozzleC ?? null, target: null }], bed: { current: message.bedC ?? null, target: null }, chamber: null },
        errors: message.errorCode ? [{ code: message.errorCode }] : [], observedAt: message.observedAt ?? null };
}
function bridgeStatus(printer, message, now) {
    if (!message) return normalized(printer, { state: 'OFFLINE', errorCode: 'bridge_not_connected' });
    const observed = Date.parse(message.observedAt);
    if (message.storeId !== printer.storeId || message.printerId !== String(printer._id) || !STATES.includes(message.state) ||
        !Number.isFinite(observed) || observed > now + 30000 ||
        ['percent', 'timeRemainingSec', 'nozzleC', 'bedC'].some(key => message[key] != null && !Number.isFinite(message[key])) ||
        (message.percent != null && (message.percent < 0 || message.percent > 100)) ||
        (message.timeRemainingSec != null && message.timeRemainingSec < 0) ||
        (message.errorCode != null && !/^[a-zA-Z0-9_-]{1,80}$/.test(message.errorCode))) throw new PrinterProtocolError();
    // Two missed 60-second summaries means offline; stale temperatures are hidden.
    if (now - observed > 120000) return normalized(printer, { state: 'OFFLINE', errorCode: 'bridge_not_connected', observedAt: message.observedAt });
    return normalized(printer, message);
}

/**
 * Read-only bridge projection or deterministic local mock. The future Bridge
 * initiates outbound WSS to FIT; this module opens no connection of any kind.
 * @returns {import('./types').PrinterAdapter}
 */
export function createPrinterAdapter(printer, { bridgeMessage = printer.bridgeMessage, now = Date.now() } = {}) {
    const mode = printer.mode || 'manual';
    if (!Object.hasOwn(capabilityMatrix, mode)) throw new PrinterProtocolError();
    const capabilities = capabilityMatrix[mode], vendor = mode === 'bambu_lan' ? 'bambu' : mode === 'prusalink' ? 'prusa' : mode;
    let status = mode === 'mock'
        ? normalized(printer, { ...(mockStates[printer.status] || mockStates.offline), state: Object.hasOwn(mockStates, printer.status) ? printer.status.toUpperCase() : 'OFFLINE', observedAt: fixtureTime })
        : mode === 'manual'
            ? normalized(printer, { state: STATES.includes(printer.status?.toUpperCase()) ? printer.status.toUpperCase() : 'UNKNOWN', observedAt: printer.lastSeenAt ? new Date(printer.lastSeenAt).toISOString() : null })
            : bridgeStatus(printer, bridgeMessage, now);
    const listeners = new Set(), files = new Set();
    const ok = value => ({ ok: true, value: structuredClone(value) });
    function requireCapability(capability) {
        if (!capabilities[capability]) throw new PrinterCapabilityError(capability, capabilities.lockedReason);
        if (status.state === 'OFFLINE') throw new PrinterOfflineError();
    }
    function transition(state) { status = { ...status, state, vendorState: state.toLowerCase() }; for (const cb of listeners) cb(structuredClone(status)); return ok(undefined); }
    return {
        vendor,
        connect: async () => ok({ printerId: String(printer._id), vendor, model: printer.model || 'UNKNOWN', displayName: printer.name, capabilities }),
        disconnect: async () => { listeners.clear(); },
        getCapabilities: () => ({ ...capabilities }),
        getStatus: async () => ok(status), getProgress: async () => ok(status.progress), getTemps: async () => ok(status.temps),
        onStatus: cb => { listeners.add(cb); return () => listeners.delete(cb); },
        uploadFile: async spec => {
            requireCapability('uploadFile');
            if (!spec || !/^[a-f0-9]{64}$/i.test(spec.sha256 || '') || !spec.fileName) throw new PrinterError('Invalid mock upload', 'FILE_ERROR');
            // No URL is fetched. This handle is an in-memory simulation only.
            const fileRef = `mock-file-${files.size + 1}`; files.add(fileRef); return ok({ fileRef });
        },
        startJob: async spec => {
            requireCapability('startJob');
            if (!spec?.confirmToken || !files.has(spec.fileRef)) throw new PrinterError('Confirm a clear bed and choose a mock file', 'POLICY_DENIED');
            if (!['IDLE', 'FINISHED', 'CANCELLED'].includes(status.state)) throw new PrinterError('Printer is busy', 'BUSY');
            transition('PRINTING'); return ok({ jobId: 'mock-job-1' });
        },
        pauseJob: async () => { requireCapability('pauseResume'); if (status.state !== 'PRINTING') throw new PrinterError('Printer is not printing', 'INVALID_STATE'); return transition('PAUSED'); },
        resumeJob: async () => { requireCapability('pauseResume'); if (status.state !== 'PAUSED') throw new PrinterError('Printer is not paused', 'INVALID_STATE'); return transition('PRINTING'); },
        stopJob: async () => { requireCapability('stopJob'); if (!['PRINTING', 'PAUSED', 'PREPARING'].includes(status.state)) throw new PrinterError('No active print', 'INVALID_STATE'); return transition('CANCELLED'); },
    };
}
