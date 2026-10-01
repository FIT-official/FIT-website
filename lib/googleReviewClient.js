import { isGoogleMeasurementHost } from './googleMeasurementConfig';

// This loader is separate from analytics. Calling render sends the five order
// fields to Google even if the customer subsequently declines the survey.
export function loadGoogleReviewPlatform(win = window, doc = document) {
    if (!isGoogleMeasurementHost(win.location.hostname)) return Promise.resolve(false);
    if (win.gapi?.load) return Promise.resolve(true);
    if (win.__fitGoogleReviewLoading) return win.__fitGoogleReviewLoading;
    const pending = new Promise(resolve => {
        const script = doc.createElement('script');
        script.id = 'fit-google-review-platform';
        script.async = true;
        let done = false;
        const finish = value => {
            if (done) return;
            done = true; clearTimeout(timer);
            if (!value) { script.remove(); win.__fitGoogleReviewLoading = null; }
            resolve(value);
        };
        const timer = setTimeout(() => finish(false), 10000);
        win.fitGoogleReviewReady = () => finish(Boolean(win.gapi?.load));
        script.src = 'https://apis.google.com/js/platform.js?onload=fitGoogleReviewReady';
        script.onerror = () => finish(false);
        doc.head.appendChild(script);
    });
    win.__fitGoogleReviewLoading = pending;
    return pending;
}

export async function openGoogleReview(payload, win = window, doc = document, { isActive = () => true } = {}) {
    if (!payload?.order_id || !isGoogleMeasurementHost(win.location.hostname)) return false;
    const shown = win.__fitGoogleReviewOrders ||= new Set();
    if (shown.has(payload.order_id)) return false;
    if (!await loadGoogleReviewPlatform(win, doc) || !isActive()) return false;
    return new Promise(resolve => {
        let active = true;
        const timer = setTimeout(() => { active = false; resolve(false); }, 10000);
        try { win.gapi.load('surveyoptin', {
            callback: () => {
                if (!active || !isActive() || shown.has(payload.order_id)) { clearTimeout(timer); resolve(false); return; }
                try {
                    // Whitelist again at the SDK boundary; never spread an order.
                    win.gapi.surveyoptin.render({ merchant_id: payload.merchant_id, order_id: payload.order_id,
                        email: payload.email, delivery_country: payload.delivery_country,
                        estimated_delivery_date: payload.estimated_delivery_date, opt_in_style: 'CENTER_DIALOG' });
                    shown.add(payload.order_id); clearTimeout(timer); active = false; resolve(true);
                } catch { clearTimeout(timer); active = false; resolve(false); }
            },
            onerror: () => { clearTimeout(timer); active = false; resolve(false); },
            timeout: 10000,
            ontimeout: () => { clearTimeout(timer); active = false; resolve(false); },
        }); } catch { clearTimeout(timer); active = false; resolve(false); }
    });
}
