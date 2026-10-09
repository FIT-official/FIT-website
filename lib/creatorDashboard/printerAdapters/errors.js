export class PrinterError extends Error {
    constructor(message, code, retryable = false) {
        super(message); this.name = new.target.name; this.code = code; this.retryable = retryable;
    }
    toJSON() { return { code: this.code, message: this.message, retryable: this.retryable }; }
}
export class PrinterOfflineError extends PrinterError {
    constructor() { super('FIT Bridge is not connected', 'UNREACHABLE', true); }
}
export class PrinterAuthError extends PrinterError {
    constructor() { super('Printer authentication failed on FIT Bridge', 'AUTH_FAILED'); }
}
export class PrinterTimeoutError extends PrinterError {
    constructor() { super('FIT Bridge response timed out', 'TIMEOUT', true); }
}
export class PrinterCapabilityError extends PrinterError {
    constructor(capability, reason = 'LOCAL_POLICY') {
        super(`Printer capability is unavailable: ${capability}`, reason.startsWith('BAMBU') ? 'FIRMWARE_LOCKED' : reason === 'LOCAL_POLICY' ? 'POLICY_DENIED' : 'NOT_SUPPORTED');
        this.capability = capability;
    }
}
export class PrinterProtocolError extends PrinterError {
    constructor() { super('Invalid FIT Bridge summary', 'PROTOCOL_ERROR'); }
}
