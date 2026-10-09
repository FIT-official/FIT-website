// @vitest-environment node
import { expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPrinterAdapter, mockStates } from '@/lib/creatorDashboard/printerAdapters';
import { capabilityMatrix, canStart } from '@/lib/creatorDashboard/printerAdapters/capabilities';
import { PrinterError, PrinterOfflineError, PrinterAuthError, PrinterTimeoutError, PrinterCapabilityError, PrinterProtocolError } from '@/lib/creatorDashboard/printerAdapters/errors';
const printer = { _id: 'printer-A', storeId: 'user_A', name: 'A1', model: 'A1', mode: 'mock', status: 'idle' };
it.each(Object.keys(mockStates))('mock %s is deterministic with normalized state, progress and temperatures', async status => {
    const adapter = createPrinterAdapter({ ...printer, status });
    const first = await adapter.getStatus(), second = await adapter.getStatus();
    expect(first).toEqual(second); expect(first.value.state).toBe(status.toUpperCase());
    expect((await adapter.getProgress()).value).toEqual(first.value.progress);
    expect((await adapter.getTemps()).value).toEqual(first.value.temps);
    expect(first.value.progress.percent).toBe(mockStates[status].percent);
});
it.each(['prusalink', 'bambu_lan'])('%s defaults offline without FIT Bridge; every control stays capability gated', async mode => {
    const adapter = createPrinterAdapter({ ...printer, mode, capabilities: { startJob: true } });
    expect((await adapter.getStatus()).value).toMatchObject({ state: 'OFFLINE', errors: [{ code: 'bridge_not_connected' }] });
    expect(canStart(adapter.getCapabilities())).toBe(false);
    for (const method of ['uploadFile', 'startJob', 'pauseJob', 'resumeJob', 'stopJob']) await expect(adapter[method]({})).rejects.toBeInstanceOf(PrinterCapabilityError);
    expect(capabilityMatrix[mode].uploadFile).toBe(false);
});
it.each(['prusalink', 'bambu_lan'])('%s reads only a recent matching normalized Bridge message', async mode => {
    const observedAt = '2026-10-09T17:00:00Z', now = Date.parse(observedAt) + 30000;
    const bridgeMessage = { storeId: 'user_A', printerId: 'printer-A', observedAt, state: 'PRINTING', percent: 37, timeRemainingSec: 60, nozzleC: 210, bedC: 60 };
    const adapter = createPrinterAdapter({ ...printer, mode }, { bridgeMessage, now });
    expect((await adapter.getStatus()).value).toMatchObject({ state: 'PRINTING', progress: { percent: 37 }, temps: { bed: { current: 60 } } });
    expect((await createPrinterAdapter({ ...printer, mode }, { bridgeMessage, now: now + 120000 }).getStatus()).value.state).toBe('OFFLINE');
    for (const change of [{ storeId: 'user_B' }, { printerId: 'B' }, { percent: 101 }, { nozzleC: NaN }, { state: 'invented' }, { observedAt: 'invalid' }]) {
        expect(() => createPrinterAdapter({ ...printer, mode }, { bridgeMessage: { ...bridgeMessage, ...change }, now })).toThrow(PrinterProtocolError);
    }
});
it('mock controls simulate only in memory and require a file and bed confirmation', async () => {
    const adapter = createPrinterAdapter(printer), states = [];
    const unsubscribe = adapter.onStatus(status => states.push(status.state));
    await expect(adapter.startJob({})).rejects.toMatchObject({ code: 'POLICY_DENIED' });
    const file = (await adapter.uploadFile({ sha256: 'a'.repeat(64), fileName: 'fixture.gcode' })).value;
    await adapter.startJob({ ...file, confirmToken: 'local-confirmation' });
    await adapter.pauseJob(); await adapter.resumeJob(); await adapter.stopJob();
    expect(states).toEqual(['PRINTING', 'PAUSED', 'PRINTING', 'CANCELLED']); unsubscribe(); await adapter.disconnect();
});
it('typed error model has safe messages, stable codes and retry information', () => {
    const errors = [new PrinterOfflineError(), new PrinterAuthError(), new PrinterTimeoutError(), new PrinterCapabilityError('startJob'), new PrinterProtocolError()];
    expect(errors.every(error => error instanceof PrinterError)).toBe(true);
    expect(errors.map(error => error.code)).toEqual(['UNREACHABLE', 'AUTH_FAILED', 'TIMEOUT', 'POLICY_DENIED', 'PROTOCOL_ERROR']);
    expect(errors[0].toJSON()).toMatchObject({ retryable: true });
});
it('adapter directory contains no socket, HTTP, MQTT or cloud clients', () => {
    const dir = resolve('lib/creatorDashboard/printerAdapters');
    const forbidden = /(?:from\s*|import\s*\(|require\s*\()\s*['"](?:node:)?(?:net|tls|https?|http2|dgram|mqtt|mqtts|ws|axios|got|undici|node-fetch|socket\.io-client)(?:[/'"]|$)|\b(?:fetch|WebSocket|XMLHttpRequest|EventSource)\s*\(|bambu[_-]?cloud|api\.bambulab/i;
    for (const file of readdirSync(dir)) if (file.endsWith('.js')) expect(readFileSync(resolve(dir, file), 'utf8'), file).not.toMatch(forbidden);
});
