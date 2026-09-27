import { beforeEach, describe, expect, it, vi } from 'vitest';
const capture = vi.hoisted(() => vi.fn());
vi.mock('posthog-js', () => ({ default: { capture } }));
import { captureCheckoutEvent } from '@/lib/checkoutAnalytics';

beforeEach(() => { localStorage.clear(); capture.mockReset().mockReturnValue({ event: 'captured' }); });
describe('checkout analytics', () => {
    it('does not track without accepted cookie consent', () => {
        captureCheckoutEvent('checkout_started', 'cs_1');
        localStorage.setItem('fit_cookie_consent', 'declined');
        captureCheckoutEvent('checkout_completed', 'cs_1');
        expect(capture).not.toHaveBeenCalled();
    });
    it('counts each session and stage once without personal details', () => {
        localStorage.setItem('fit_cookie_consent', 'accepted');
        captureCheckoutEvent('checkout_started', 'cs_1');
        captureCheckoutEvent('checkout_started', 'cs_1');
        captureCheckoutEvent('checkout_completed', 'cs_1');
        expect(capture).toHaveBeenCalledTimes(2);
        expect(capture).toHaveBeenLastCalledWith('checkout_completed', {session_id:'cs_1',$insert_id:'checkout_completed:cs_1'});
    });
    it('can retry when the analytics client was not ready', () => {
        localStorage.setItem('fit_cookie_consent', 'accepted');
        capture.mockReturnValueOnce(undefined);
        captureCheckoutEvent('checkout_completed', 'cs_1');
        captureCheckoutEvent('checkout_completed', 'cs_1');
        expect(capture).toHaveBeenCalledTimes(2);
    });
    it('does not interrupt payment when analytics fails', () => {
        localStorage.setItem('fit_cookie_consent', 'accepted');
        capture.mockImplementation(() => { throw new Error('offline'); });
        expect(() => captureCheckoutEvent('checkout_completed', 'cs_1')).not.toThrow();
    });
});
