import posthog from 'posthog-js';

// Analytics follows the site's cookie choice and never carries contact details.
// Payment/order records remain the source of truth when analytics is declined.
export function captureCheckoutEvent(event, sessionId) {
    if (!sessionId || typeof window === 'undefined') return;
    try {
        if (localStorage.getItem('fit_cookie_consent') !== 'accepted') return;
        const key = `fit_analytics:${event}:${sessionId}`;
        if (localStorage.getItem(key)) return;
        const sent = posthog.capture(event, { session_id: sessionId, $insert_id: `${event}:${sessionId}` });
        if (sent) localStorage.setItem(key, '1');
    } catch { /* Analytics cannot interrupt payment or status recovery. */ }
}
