import { GOOGLE_TAG_ID, GOOGLE_MERCHANT_DESTINATION, isGoogleMeasurementHost } from './googleMeasurementConfig';
import { readAnalyticsConsent } from './analyticsConsent';

const SCRIPT_ID = 'fit-google-measurement';
const denied = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };

export function googlePageLocation(location) {
    // Never pass checkout session tokens, contact data or arbitrary URL queries.
    const path = /^\/(shop|products)(\/|$)/.test(location.pathname) ? location.pathname : '/';
    const url = new URL(path, location.origin);
    const click = new URLSearchParams(location.search).get('srsltid');
    if (click && /^[a-zA-Z0-9_-]{1,500}$/.test(click)) url.searchParams.set('srsltid', click);
    return url.href;
}

export function loadGoogleTag(win = window, doc = document) {
    try {
        if (!isGoogleMeasurementHost(win.location.hostname) || readAnalyticsConsent(win.localStorage) !== 'accepted') return Promise.resolve(false);
    } catch { return Promise.resolve(false); }
    const state = win.__fitGoogleMeasurement ||= { ready: false, loading: null };
    if (state.ready) {
        win.gtag('consent', 'update', { ...denied, analytics_storage: 'granted' });
        return Promise.resolve(true);
    }
    if (state.loading) return state.loading;
    state.loading = new Promise(resolve => {
        win.dataLayer ||= [];
        win.gtag ||= function () { win.dataLayer.push(arguments); };
        // Basic consent mode: even this queue and the SDK are created only after consent.
        if (!state.configured) win.gtag('consent', 'default', denied);
        win.gtag('consent', 'update', { ...denied, analytics_storage: 'granted' });
        if (!state.configured) {
            win.gtag('js', new Date());
            win.gtag('config', GOOGLE_TAG_ID, {
                send_page_view: false,
                allow_google_signals: false,
                allow_ad_personalization_signals: false,
                page_location: googlePageLocation(win.location),
                page_referrer: '',
            });
            state.configured = true;
        }
        const script = doc.createElement('script');
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true; clearTimeout(timer);
            if (!value) { script.remove(); state.loading = null; }
            resolve(value);
        };
        const timer = setTimeout(() => finish(false), 10000);
        script.id = SCRIPT_ID;
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}`;
        script.onload = () => {
            if (settled) return;
            state.ready = true;
            finish(readAnalyticsConsent(win.localStorage) === 'accepted');
        };
        script.onerror = () => finish(false);
        doc.head.appendChild(script);
    });
    return state.loading;
}

export function denyGoogleAnalytics(win = window) {
    // Withdraw the SDK's consent as well as guarding all future FIT events.
    if (win.__fitGoogleMeasurement && typeof win.gtag === 'function') win.gtag('consent', 'update', denied);
}

export function queueGooglePurchase(purchase, win = window) {
    try {
        if (!isGoogleMeasurementHost(win.location.hostname) || readAnalyticsConsent(win.localStorage) !== 'accepted' ||
            !win.__fitGoogleMeasurement?.ready || typeof win.gtag !== 'function') return false;
        // Exact destination read from FIT's connected Merchant source. No URL
        // conversion rule or account-number-derived destination is involved.
        win.gtag('event', 'purchase', { ...purchase, send_to: GOOGLE_MERCHANT_DESTINATION, page_location: googlePageLocation(win.location) });
        return true; // Queued, not a receipt from Google's reporting service.
    } catch { return false; }
}
