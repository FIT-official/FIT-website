import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readAnalyticsConsent, writeAnalyticsConsent } from '@/lib/analyticsConsent';
import { loadGoogleTag, denyGoogleAnalytics, queueGooglePurchase, googlePageLocation } from '@/lib/googleTagClient';
import { openGoogleReview } from '@/lib/googleReviewClient';
import { isoCountryCode } from '@/lib/isoCountryCodes';

let win, scripts, doc;
beforeEach(() => {
    localStorage.clear(); scripts = [];
    win = { location: new URL('https://www.fixitoday.com/checkout/return?session_id=cs_PRIVATE&email=PRIVATE'), localStorage };
    doc = { createElement: () => ({ remove: vi.fn() }), head: { appendChild: script => scripts.push(script) } };
});
describe('basic consent and the verified Google tag', () => {
    it('keeps earlier declines and re-prompts earlier generic accepts for the new notice', () => {
        localStorage.setItem('fit_cookie_consent', 'declined'); expect(readAnalyticsConsent(localStorage)).toBe('declined');
        localStorage.setItem('fit_cookie_consent', 'accepted'); expect(readAnalyticsConsent(localStorage)).toBeNull();
        writeAnalyticsConsent(localStorage, 'accepted'); expect(readAnalyticsConsent(localStorage)).toBe('accepted');
    });
    it.each([null, 'declined', 'accepted'])('creates no SDK, queue or requests without current notice consent: %s', async choice => {
        if (choice) localStorage.setItem('fit_cookie_consent', choice);
        expect(await loadGoogleTag(win, doc)).toBe(false); expect(scripts).toHaveLength(0); expect(win.dataLayer).toBeUndefined();
    });
    it('excludes previews and local tests from production measurement', async () => {
        writeAnalyticsConsent(localStorage, 'accepted'); win.location = new URL('https://preview.vercel.app/shop');
        expect(await loadGoogleTag(win, doc)).toBe(false); expect(scripts).toHaveLength(0);
    });
    it('initialises once, keeps ad consent denied and waits for SDK readiness', async () => {
        writeAnalyticsConsent(localStorage, 'accepted'); const a = loadGoogleTag(win, doc); const b = loadGoogleTag(win, doc);
        expect(scripts).toHaveLength(1); expect(scripts[0].src).toContain('id=GT-WVC7JD8N');
        expect(queueGooglePurchase({ transaction_id: 'fixture' }, win)).toBe(false);
        scripts[0].onload(); expect(await a).toBe(true); expect(await b).toBe(true);
        expect(win.dataLayer.filter(args => args[0] === 'config')).toHaveLength(1);
        const config = [...win.dataLayer.find(args => args[0] === 'config')];
        expect(config[2]).toMatchObject({ send_page_view: false, allow_google_signals: false, page_location: 'https://www.fixitoday.com/' });
        expect(win.dataLayer[1][2]).toMatchObject({ analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    });
    it('strips session IDs, email and arbitrary query values but preserves a valid shopping click', () => {
        expect(googlePageLocation(win.location)).not.toMatch(/PRIVATE|session_id|email/);
        expect(googlePageLocation(new URL('https://www.fixitoday.com/shop?srsltid=abc_123&email=secret'))).toBe('https://www.fixitoday.com/shop?srsltid=abc_123');
    });
    it('can retry an SDK failure without breaking the checkout', async () => {
        writeAnalyticsConsent(localStorage, 'accepted'); const load = loadGoogleTag(win, doc); scripts[0].onerror();
        expect(await load).toBe(false); const retry = loadGoogleTag(win, doc); scripts[1].onload(); expect(await retry).toBe(true);
        expect(win.dataLayer.filter(args => args[0] === 'config')).toHaveLength(1);
    });
    it('guards purchase dispatch and updates the SDK when consent is withdrawn', async () => {
        writeAnalyticsConsent(localStorage, 'accepted'); const loading = loadGoogleTag(win, doc); scripts[0].onload(); await loading;
        expect(queueGooglePurchase({ transaction_id: 'fixture', items: [] }, win)).toBe(true);
        expect(win.dataLayer.find(args => args[0] === 'event')[2].send_to).toBe('MC-DXFF1614W0');
        writeAnalyticsConsent(localStorage, 'declined'); denyGoogleAnalytics(win);
        expect(queueGooglePurchase({ transaction_id: 'another', items: [] }, win)).toBe(false);
        expect([...win.dataLayer.at(-1)]).toEqual(['consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }]);
        expect(win.dataLayer.filter(args => args[0] === 'event')).toHaveLength(1);
    });
    it('fails closed if storage access itself is denied', async () => {
        Object.defineProperty(win, 'localStorage', { get() { throw new Error('blocked'); } });
        expect(await loadGoogleTag(win, doc)).toBe(false); expect(queueGooglePurchase({}, win)).toBe(false);
    });
});
describe('Google review SDK boundary', () => {
    it('renders only the required transaction fields after a deliberate open, even if analytics is declined', async () => {
        writeAnalyticsConsent(localStorage, 'declined');
        const render = vi.fn(); win.gapi = { load: (_name, options) => options.callback(), surveyoptin: { render } };
        const payload = { merchant_id: 5861883835, order_id: 'fixture', email: 'buyer@example.test', delivery_country: 'SG', estimated_delivery_date: '2026-10-09', adminNote: 'PRIVATE' };
        expect(await openGoogleReview(payload, win, doc)).toBe(true);
        expect(render).toHaveBeenCalledWith({ merchant_id: 5861883835, order_id: 'fixture', email: 'buyer@example.test', delivery_country: 'SG', estimated_delivery_date: '2026-10-09', opt_in_style: 'CENTER_DIALOG' });
        expect(await openGoogleReview(payload, win, doc)).toBe(false); expect(render).toHaveBeenCalledTimes(1);
    });
    it('never sends preview or missing-order data', async () => {
        win.location = new URL('http://localhost:3000');
        expect(await openGoogleReview({ order_id: 'fixture' }, win, doc)).toBe(false); expect(scripts).toHaveLength(0);
    });
    it('validates assigned countries rather than guessing Singapore', () => {
        expect(isoCountryCode('sg')).toBe('SG'); expect(isoCountryCode(' GB ')).toBe('GB');
        for (const value of ['ZZ', 'UK', 'XA', 'AA', '', 'Singapore', null]) expect(isoCountryCode(value)).toBeNull();
    });
});
