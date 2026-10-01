// Pure dispatch guard. The browser adapter returns true only after the
// consented, configured tag accepts queueing.
// Queue acceptance is not a receipt from Google's reporting backend.
export function createGooglePurchaseDispatcher({
    enabled = false, configurationApproved = false,
    getConsent = () => null, tagReady = () => false,
    storage = null, send = null, withLock = async (_key, run) => run(),
} = {}) {
    const inFlight = new Set();
    return async function dispatch(payload) {
        const id = payload?.transaction_id;
        if (!enabled || !configurationApproved || !id || !Array.isArray(payload.items) ||
            typeof send !== 'function' || !storage || inFlight.has(id)) return false;
        inFlight.add(id);
        try {
            return await withLock(`fit_google_purchase:${id}`, async () => {
                // Recheck inside the lock, including consent withdrawn while waiting.
                if (getConsent() !== 'accepted' || !tagReady()) return false;
                const key = `fit_google_purchase:${id}`;
                if (storage.getItem(key)) return false;
                if (await send(payload) !== true) return false;
                storage.setItem(key, 'queued');
                return true;
            });
        } catch {
            // A blocked storage API, absent SDK or network failure must never
            // interrupt paid-order status. A failed attempt can be retried.
            return false;
        } finally { inFlight.delete(id); }
    };
}
