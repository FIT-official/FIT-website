export class StoreRequestError extends Error {
    constructor(message, status = 0, code = '') { super(message); this.status = status; this.code = code; }
}

export async function storeFetch(url, options = {}, timeoutMs = 15000) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new StoreRequestError('You are offline. Reconnect, then try again.');
    }
    const controller = new AbortController();
    let timer;
    try {
        const response = await Promise.race([
            (async () => {
                const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
                let data;
                try { data = await response.json(); }
                catch { throw new StoreRequestError('The shop returned an incomplete response. Please try again.'); }
                return { ok: response.ok, status: response.status, json: async () => data };
            })(),
            new Promise((_, reject) => { timer = setTimeout(() => {
                controller.abort();
                reject(new StoreRequestError('This is taking longer than expected. Check your connection and try again.'));
            }, timeoutMs); }),
        ]);
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            const message = typeof data.error === 'string' ? data.error :
                response.status === 401 ? 'Your session could not be checked. Reload your cart or sign in again.' : 'The shop is temporarily unavailable. Please try again.';
            throw new StoreRequestError(message, response.status, data.code);
        }
        return response;
    } catch (error) {
        if (error instanceof StoreRequestError) throw error;
        throw new StoreRequestError('Unable to connect to the shop. Check your connection and try again.');
    } finally { clearTimeout(timer); }
}

export async function storeJson(url, options, timeoutMs) {
    const response = await storeFetch(url, options, timeoutMs);
    try { return await response.json(); }
    catch { throw new StoreRequestError('The shop returned an incomplete response. Please try again.'); }
}

const ATTEMPT_KEY = 'fit_checkout_attempt';
export function savedCheckoutAttempt() {
    if (typeof window !== 'undefined') {
        const fromUrl = new URLSearchParams(window.location.search).get('attempt');
        if (/^[a-f0-9-]{36}$/.test(fromUrl || '')) return fromUrl;
    }
    try { return sessionStorage.getItem(ATTEMPT_KEY) || ''; } catch { return ''; }
}
export function rememberCheckoutAttempt(id) {
    if (typeof window !== 'undefined' && window.location.pathname === '/checkout' && id) {
        const url = new URL(window.location.href);
        url.searchParams.set('attempt', id);
        window.history.replaceState(window.history.state, '', url);
    }
    try { if (id) sessionStorage.setItem(ATTEMPT_KEY, id); else sessionStorage.removeItem(ATTEMPT_KEY); } catch { /* Server intent remains authoritative. */ }
}

let cartBootstrap;
export async function addShopItem(cartItem) {
    // Establish the HttpOnly cookie before a mutation, so a lost POST response
    // cannot strand the guest's cart. Concurrent cards share this first read.
    if (!cartBootstrap) cartBootstrap = storeJson('/api/user/cart').finally(() => { cartBootstrap = null; });
    await cartBootstrap;
    return storeJson('/api/user/cart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cartItem }) });
}
