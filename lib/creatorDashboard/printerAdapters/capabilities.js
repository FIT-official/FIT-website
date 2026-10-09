const readOnly = { readStatus: true, readProgress: true, readTemps: true, readTimeRemaining: 'reported',
    readCameraSnapshot: false, uploadFile: false, startJob: false, pauseResume: false, stopJob: false, multiNozzle: false };

// Effective SITE capabilities, not a claim that every vendor API lacks controls.
// PrusaLink controls are documented but deliberately disabled in this read-only
// scaffold. Bambu firmware-dependent controls stay locked, including uploads.
export const capabilityMatrix = Object.freeze({
    mock: Object.freeze({ ...readOnly, uploadFile: true, startJob: true, pauseResume: true, stopJob: true }),
    manual: Object.freeze({ ...readOnly, readProgress: false, readTemps: false, readTimeRemaining: 'none', lockedReason: 'LOCAL_POLICY' }),
    prusalink: Object.freeze({ ...readOnly, lockedReason: 'LOCAL_POLICY' }),
    bambu_lan: Object.freeze({ ...readOnly, lockedReason: 'BAMBU_AUTH_CONTROL' }),
});
export const canStart = capabilities => capabilities.uploadFile && capabilities.startJob;
