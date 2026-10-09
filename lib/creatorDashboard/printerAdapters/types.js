/**
 * Server-side mirror of the FIT Bridge adapter contract. No LAN connection data
 * belongs here. Success uses Result<T>; failures throw the typed PrinterError
 * subclasses, including unsupported controls (the dashboard ruling).
 * @typedef {'IDLE'|'PREPARING'|'PRINTING'|'PAUSED'|'FINISHED'|'CANCELLED'|'ERROR'|'ATTENTION'|'OFFLINE'|'UNKNOWN'} PrinterState
 * @typedef {{current: number|null, target: number|null}} TempReading
 * @typedef {{nozzles: TempReading[], bed: TempReading|null, chamber: TempReading|null}} Temps
 * @typedef {{percent: number|null, timeRemainingSec: number|null, timeRemainingSource: 'printer'|'estimated'|'none', elapsedSec: number|null, jobName: string|null, jobId?: string|null}} Progress
 * @typedef {{readStatus: boolean, readProgress: boolean, readTemps: boolean, readTimeRemaining: 'reported'|'estimated'|'none', readCameraSnapshot: boolean, uploadFile: boolean, startJob: boolean, pauseResume: boolean, stopJob: boolean, multiNozzle: boolean, lockedReason?: string}} Capabilities
 * @typedef {{printerId: string, state: PrinterState, vendorState: string, progress: Progress, temps: Temps, errors: {code: string, message?: string}[], observedAt: string|null}} PrinterStatus
 * @template T
 * @typedef {{ok: true, value: T}} Result
 * @typedef {{sourceUrl: string, sha256: string, fileName: string, storage?: string}} UploadSpec
 * @typedef {{fileRef: string, confirmToken: string}} StartJobSpec
 * @typedef {{printerId: string, vendor: string, model: string, displayName: string, capabilities: Capabilities}} PrinterDescriptor
 * @typedef {Object} PrinterAdapter
 * @property {string} vendor
 * @property {() => Promise<Result<PrinterDescriptor>>} connect Local descriptor only; never connects to a printer.
 * @property {() => Promise<void>} disconnect
 * @property {() => Capabilities} getCapabilities
 * @property {() => Promise<Result<PrinterStatus>>} getStatus
 * @property {() => Promise<Result<Progress>>} getProgress
 * @property {() => Promise<Result<Temps>>} getTemps
 * @property {(cb: (status: PrinterStatus) => void) => () => void} onStatus
 * @property {(spec: UploadSpec) => Promise<Result<{fileRef: string}>>} uploadFile
 * @property {(spec: StartJobSpec) => Promise<Result<{jobId: string}>>} startJob
 * @property {() => Promise<Result<void>>} pauseJob
 * @property {() => Promise<Result<void>>} resumeJob
 * @property {() => Promise<Result<void>>} stopJob
 */
export {};
