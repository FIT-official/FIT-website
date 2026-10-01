import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const m = vi.hoisted(() => ({ open: vi.fn(), dispatch: vi.fn(), ready: true }));
vi.mock('@/lib/googleReviewClient', () => ({ openGoogleReview: m.open }));
vi.mock('@/components/General/GoogleMeasurementProvider', () => ({ useGoogleMeasurement: () => ({ ready: m.ready, dispatchPurchase: m.dispatch }) }));
import AnalyticsConsentProvider, { AnalyticsCookieChoices } from '@/components/General/AnalyticsConsentProvider';
import PaidOrderMeasurement, { GoogleReviewChoice } from '@/components/Checkout/PaidOrderMeasurement';
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); m.open.mockResolvedValue(true); m.ready = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('customer-facing Google choices', () => {
    it('names Google and lets customers decline or later change their analytics choice', async () => {
        render(<AnalyticsConsentProvider><AnalyticsCookieChoices /></AnalyticsConsentProvider>);
        expect(await screen.findByRole('region', { name: 'Analytics cookie choices' })).toHaveTextContent('Google');
        fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
        expect(localStorage.getItem('fit_cookie_consent')).toBe('declined');
        fireEvent.click(screen.getByRole('button', { name: 'Change analytics cookie choices' }));
        fireEvent.click(screen.getByRole('button', { name: 'Accept analytics' }));
        expect(localStorage.getItem('fit_cookie_consent_notice')).toBe('google-purchase-v1');
    });
    it('discloses transfer at opening and offers the same Google module on eligible confirmations', async () => {
        render(<GoogleReviewChoice review={{ order_id: 'fixture' }} />);
        expect(screen.getByText(/even if you then decline/)).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('has opened'));
        expect(m.open).toHaveBeenCalledTimes(1);
    });
    it('shows a safe SDK error and retry, leaving order status alone', async () => {
        m.open.mockResolvedValueOnce(false); render(<GoogleReviewChoice review={{ order_id: 'fixture' }} />);
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('order is unaffected'));
        fireEvent.click(screen.getByRole('button', { name: 'Try Google survey choice again' }));
        await waitFor(() => expect(m.open).toHaveBeenCalledTimes(2));
    });
    it('does not fetch or count a bare or malformed return route', () => {
        const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); render(<PaidOrderMeasurement sessionId={null} />);
        expect(fetch).not.toHaveBeenCalled(); expect(m.dispatch).not.toHaveBeenCalled();
    });
    it('uses the protected receipt and only dispatches when the consented tag is ready', async () => {
        const purchase = { transaction_id: 'fixture', items: [] }; m.ready = false;
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ purchase, review: null }) }));
        const view = render(<PaidOrderMeasurement sessionId="cs_fixture" />);
        await waitFor(() => expect(fetch).toHaveBeenCalled()); expect(m.dispatch).not.toHaveBeenCalled();
        m.ready = true; view.rerender(<PaidOrderMeasurement sessionId="cs_fixture" />);
        await waitFor(() => expect(m.dispatch).toHaveBeenCalledWith(purchase));
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('does not expose a review choice after owner denial or missing verified date', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
        render(<PaidOrderMeasurement sessionId="cs_fixture" />); await waitFor(() => expect(fetch).toHaveBeenCalled());
        expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(m.dispatch).not.toHaveBeenCalled();
    });
});
