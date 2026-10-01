export const ANALYTICS_CONSENT_KEY = 'fit_cookie_consent';
export const ANALYTICS_NOTICE_KEY = 'fit_cookie_consent_notice';
export const ANALYTICS_NOTICE_VERSION = 'google-purchase-v1';

export function readAnalyticsConsent(storage) {
    try {
        const choice = storage.getItem(ANALYTICS_CONSENT_KEY);
        // Keep earlier declines. Earlier generic accepts need the new notice.
        if (choice === 'declined') return 'declined';
        return choice === 'accepted' && storage.getItem(ANALYTICS_NOTICE_KEY) === ANALYTICS_NOTICE_VERSION
            ? 'accepted' : null;
    } catch { return null; }
}

export function writeAnalyticsConsent(storage, choice) {
    if (!['accepted', 'declined'].includes(choice)) return false;
    try {
        storage.setItem(ANALYTICS_NOTICE_KEY, ANALYTICS_NOTICE_VERSION);
        storage.setItem(ANALYTICS_CONSENT_KEY, choice);
        return true;
    } catch { return false; }
}
