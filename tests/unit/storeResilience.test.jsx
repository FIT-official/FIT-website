import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => {
    const originalKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_fixture';
    return { originalKey, loadStripe: vi.fn(), initCheckout: vi.fn(), elementReady: true, elementError: false,
        confirm: vi.fn(), push: vi.fn(), params: new URLSearchParams(), user: { user: null, isLoaded: false, isSignedIn: false } };
});
vi.mock('@clerk/nextjs', () => ({ useUser: () => m.user }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push }), useSearchParams: () => m.params }));
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }));
vi.mock('next/image', () => ({ default: ({ alt }) => <span role="img" aria-label={alt || ''} /> }));
vi.mock('@stripe/react-stripe-js', async importOriginal => {
    const { CheckoutProvider } = await importOriginal();
    const { useEffect, useRef } = await import('react');
    return {
        // Exercise the installed provider's initialization and error behavior.
        CheckoutProvider,
        useCheckout: () => ({ confirm: m.confirm }),
        PaymentElement: ({ onReady, onLoadError }) => {
            const initialCallbacks = useRef({ onReady, onLoadError });
            useEffect(() => {
                // A widget emits its initial load result once per mount.
                const { onReady, onLoadError } = initialCallbacks.current;
                if (m.elementError) onLoadError?.({ error: { message: 'Element failed to load' } });
                else if (m.elementReady) onReady?.();
            }, []);
            return <div>Payment details</div>;
        },
    };
});
vi.mock('@stripe/stripe-js', () => ({ loadStripe: m.loadStripe }));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));
vi.mock('@/components/General/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/components/General/CurrencyContext', () => ({ useCurrency: () => 'SGD' }));
vi.mock('@/components/Cart/CustomPrintUpload', () => ({ default: () => null }));

import Cart from '@/app/cart/Cart';
import CheckOut, { CheckoutForm } from '@/app/checkout/CheckOut';
import Return from '@/app/checkout/return/Return';
import ShopAddToCart from '@/components/Cart/ShopAddToCart';
import { storeJson } from '@/lib/storeRequest';

const intent = '00000000-0000-4000-8000-000000000001';
const product = { _id: 'p1', name: 'Lanbo PLA', slug: 'lanbo-pla', productType: 'shop', infiniteStock: true,
    images: [], basePrice: { presentmentAmount: 14.9, presentmentCurrency: 'SGD' }, variantTypes: [],
    delivery: { deliveryTypes: [{ type: 'shipping', price: 5 }] } };
const cart = [{ _id: 'line1', productId: 'p1', variantId: null, quantity: 2, selectedVariants: {}, chosenDeliveryType: 'shipping' }];
const breakdown = [{ productId: 'p1', name: 'Lanbo PLA', quantity: 2, price: 14.9, basePrice: 14.9,
    priceBeforeDiscount: 14.9, variantInfo: [], chosenDeliveryType: 'shipping', deliveryFee: 5, currency: 'SGD' }];
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
let contactReady;
function fetchRoute(url, options = {}) {
    if (url === '/api/user/cart') return Promise.resolve(response({ guest: true, cart, checkoutAttemptId: intent, contactReady }));
    if (url.startsWith('/api/product?ids')) return Promise.resolve(response({ products: [product] }));
    if (url === '/api/checkout/breakdown') return Promise.resolve(response({ cartBreakdown: breakdown }));
    if (url === '/api/user/cart/contact') { contactReady = true; return Promise.resolve(response({ success: true })); }
    if (url === '/api/checkout/session') return Promise.resolve(response({ attemptId: intent, sessionId: 'cs_one', clientSecret: 'secret',
        cartBreakdown: breakdown, userContact: { country: 'SG' } }));
    if (url.startsWith('/api/checkout/session/')) return Promise.resolve(response({ session: { status: 'open', payment_status: 'unpaid' } }));
    return Promise.resolve(response({ settings: { additionalDeliveryTypes: [] } }));
}
beforeEach(() => {
    vi.clearAllMocks();
    m.initCheckout.mockResolvedValue({ session: () => ({}), on: vi.fn() });
    m.loadStripe.mockResolvedValue({ initCheckout: m.initCheckout, elements: vi.fn(), createToken: vi.fn(),
        createPaymentMethod: vi.fn(), confirmCardPayment: vi.fn() });
    m.elementReady = true; m.elementError = false; contactReady = true; m.params = new URLSearchParams(); sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn(fetchRoute));
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
afterAll(() => { if (m.originalKey === undefined) delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = m.originalKey; });

describe('Store network recovery', () => {
    it('loads a guest cart even while the Clerk client is unavailable', async () => {
        render(<Cart />);
        expect(await screen.findByText('Lanbo PLA')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText('Proceed to Checkout')).toHaveAttribute('aria-disabled', 'false'));
        expect(screen.getByText(/This is your guest cart/)).toBeInTheDocument();
    });
    it('shows an API error and retries the saved cart on reconnect without resubmitting mutations', async () => {
        global.fetch.mockRejectedValue(new TypeError('offline'));
        render(<Cart />);
        expect(await screen.findByRole('alert')).toHaveTextContent('Unable to connect');
        global.fetch.mockImplementation(fetchRoute);
        await act(async () => { window.dispatchEvent(new Event('online')); });
        expect(await screen.findByText('Lanbo PLA')).toBeInTheDocument();
        expect(global.fetch.mock.calls.every(([, options]) => !options.method || options.method === 'GET')).toBe(true);
    });
    it.each([401, 500, 503])('does not report an item as added when the cart API returns %s', async status => {
        global.fetch.mockImplementation((url, options = {}) => options.method === 'POST' ? Promise.resolve(response({ error: 'Please try again.' }, status)) : fetchRoute(url, options));
        render(<ShopAddToCart product={product} />);
        fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Please try again');
        expect(screen.queryByText(/Added to cart/)).toBeNull();
        expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeEnabled();
    });
    it('disables shop ATC offline and makes it available after reconnecting', async () => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        render(<ShopAddToCart product={product} />);
        expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeDisabled();
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        await act(async () => window.dispatchEvent(new Event('online')));
        expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeEnabled();
        expect(global.fetch).not.toHaveBeenCalled();
    });
    it('bounds both a slow request and a stalled response body', async () => {
        vi.useFakeTimers();
        for (const fetchResult of [new Promise(() => {}), Promise.resolve({ ok: true, json: () => new Promise(() => {}) })]) {
            global.fetch.mockReturnValueOnce(fetchResult);
            const result = storeJson('/api/user/cart', {}, 100).catch(error => error);
            await vi.advanceTimersByTimeAsync(101);
            expect((await result).message).toContain('taking longer');
        }
    });
    it('rejects malformed JSON with retry copy', async () => {
        global.fetch.mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('broken JSON'); } });
        await expect(storeJson('/api/user/cart')).rejects.toThrow('incomplete response');
    });
    it('saves guest contact details and continues to the Stripe checkout session', async () => {
        contactReady = false;
        render(<CheckOut />);
        expect(await screen.findByText('Guest checkout')).toBeInTheDocument();
        for (const [label, value] of [['Full name', 'Guest Buyer'], ['Email', 'guest@example.test'], ['Street address', '1 Example Road'], ['Postal code', '123456']]) {
            fireEvent.change(screen.getByLabelText(label), { target: { value } });
        }
        fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled());
        expect(global.fetch.mock.calls.find(([url]) => url === '/api/checkout/session')[1].headers['X-Checkout-Attempt']).toBe(intent);
    });
    it('keeps checkout errors distinct from an empty cart and permits retry', async () => {
        global.fetch.mockImplementation((url, options) => url === '/api/checkout/session' ? Promise.resolve(response({ error: 'Payment service unavailable.' }, 503)) : fetchRoute(url, options));
        render(<CheckOut />);
        expect(await screen.findByRole('alert')).toHaveTextContent('Payment service unavailable');
        expect(screen.queryByText(/Your cart is empty/)).toBeNull();
        global.fetch.mockImplementation(fetchRoute);
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(await screen.findByText('Order Summary')).toBeInTheDocument();
    });
    it('renders a saved SingPost delivery fee without requiring unavailable fee components', async () => {
        global.fetch.mockImplementation((url, options) => url === '/api/checkout/session'
            ? Promise.resolve(response({ attemptId: intent, sessionId: 'cs_one', clientSecret: 'secret',
                cartBreakdown: [{ ...breakdown[0], chosenDeliveryType: 'singpost' }], userContact: { country: 'SG' } }))
            : fetchRoute(url, options));
        render(<CheckOut />);
        expect(await screen.findByText('Delivery (singpost): S$5.00')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled());
    });
});

describe('Payment submission and return recovery', () => {
    it('disables Pay until the payment element is ready', async () => {
        m.elementReady = false;
        render(<CheckoutForm sessionId="cs_one" onCheckStatus={vi.fn()} />);
        const button = screen.getByRole('button', { name: 'Pay Now' });
        expect(button).toBeDisabled();
        fireEvent.submit(button.closest('form'));
        expect(m.confirm).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
    });
    it.each(['provider', 'element'])('bounds stalled %s initialization and retries the same checkout', async stalled => {
        vi.useFakeTimers();
        if (stalled === 'provider') m.initCheckout.mockReturnValueOnce(new Promise(() => {}));
        else m.elementReady = false;
        render(<CheckOut />);
        await act(async () => { await vi.advanceTimersByTimeAsync(0); });
        expect(screen.getByText('Loading the payment form…')).toBeInTheDocument();
        await act(async () => { await vi.advanceTimersByTimeAsync(15001); });
        expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t load the payment form');
        expect(screen.queryByRole('button', { name: 'Pay Now' })).toBeNull();
        m.elementReady = true;
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
        expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled();
        const calls = global.fetch.mock.calls.filter(([url]) => url === '/api/checkout/session');
        expect(calls.map(([, options]) => options.headers['X-Checkout-Attempt'])).toEqual([intent, intent]);
        expect(m.confirm).not.toHaveBeenCalled();
    });
    it('recovers an element load error without automatically submitting payment', async () => {
        m.elementError = true;
        render(<CheckOut />);
        expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t load the payment form');
        expect(screen.queryByRole('button', { name: 'Pay Now' })).toBeNull();
        m.elementError = false;
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled());
        expect(m.confirm).not.toHaveBeenCalled();
    });
    it.each(['rejection', 'exception'])('recovers a checkout provider %s using the same attempt', async failure => {
        if (failure === 'rejection') m.initCheckout.mockRejectedValueOnce(new Error('Network interrupted'));
        else m.initCheckout.mockImplementationOnce(() => { throw new Error('Network interrupted'); });
        render(<CheckOut />);
        expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t load the payment form');
        expect(screen.queryByRole('button', { name: 'Pay Now' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled());
        const calls = global.fetch.mock.calls.filter(([url]) => url === '/api/checkout/session');
        expect(calls.map(([, options]) => options.headers['X-Checkout-Attempt'])).toEqual([intent, intent]);
        expect(m.confirm).not.toHaveBeenCalled();
    });
    it('recovers a Stripe script failure using the saved checkout identity', async () => {
        m.loadStripe.mockRejectedValueOnce(new Error('Payment controls unavailable. Please try again.'));
        render(<CheckOut />);
        expect(await screen.findByRole('alert')).toHaveTextContent('Payment controls unavailable');
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled());
        const calls = global.fetch.mock.calls.filter(([url]) => url === '/api/checkout/session');
        expect(calls).toHaveLength(2);
        expect(calls.map(([, options]) => options.headers['X-Checkout-Attempt'])).toEqual([intent, intent]);
    });
    it('shows already paid instead of payment controls when checkout is refreshed after fulfilment', async () => {
        sessionStorage.setItem('fit_checkout_attempt', intent);
        global.fetch.mockImplementation(url => Promise.resolve(response(url === '/api/user/cart'
            ? { guest: true, cart: [], contactReady: true, checkoutAttemptId: '00000000-0000-4000-8000-000000000002' }
            : { alreadyPaid: true, sessionId: 'cs_one', attemptId: intent })));
        render(<CheckOut />);
        expect(await screen.findByText('Already paid')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Pay Now' })).toBeNull();
        expect(global.fetch.mock.calls.find(([url]) => url === '/api/checkout/session')[1].headers['X-Checkout-Attempt']).toBe(intent);
    });
    it('releases a hung confirmation into status recovery without re-enabling Pay', async () => {
        vi.useFakeTimers();
        m.confirm.mockReturnValue(new Promise(() => {}));
        render(<CheckoutForm sessionId="cs_one" onCheckStatus={vi.fn()} />);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Pay Now' }));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(m.confirm).toHaveBeenCalledTimes(1);
        await act(async () => { await vi.advanceTimersByTimeAsync(20001); });
        expect(screen.getByRole('alert')).toHaveTextContent('taking longer than expected');
        expect(screen.getByRole('button', { name: 'Pay Now' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Check payment status' })).toBeEnabled();
    });
    it('locks rapid payment submissions before React can re-render', async () => {
        let resolve;
        m.confirm.mockReturnValue(new Promise(done => { resolve = done; }));
        render(<CheckoutForm sessionId="cs_one" onCheckStatus={vi.fn()} />);
        const form = screen.getByRole('button', { name: 'Pay Now' }).closest('form');
        fireEvent.submit(form); fireEvent.submit(form); fireEvent.submit(form);
        await waitFor(() => expect(m.confirm).toHaveBeenCalledTimes(1));
        expect(screen.getByRole('button', { name: 'Processing payment...' })).toBeDisabled();
        await act(async () => resolve({ type: 'success', sessionId: 'cs_one' }));
        expect(m.push).toHaveBeenCalledWith('/checkout/return?session_id=cs_one');
        fireEvent.submit(form);
        expect(m.confirm).toHaveBeenCalledTimes(1);
    });
    it('requires a status check after an uncertain confirmation, and checks again on reconnect', async () => {
        m.confirm.mockRejectedValue(new Error('Connection interrupted'));
        const check = vi.fn();
        render(<CheckoutForm sessionId="cs_one" onCheckStatus={check} />);
        fireEvent.click(screen.getByRole('button', { name: 'Pay Now' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
        expect(screen.getByRole('button', { name: 'Pay Now' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Check payment status' }));
        expect(check).toHaveBeenCalledTimes(1);
        await act(async () => window.dispatchEvent(new Event('online')));
        expect(check).toHaveBeenCalledTimes(2);
        expect(m.confirm).toHaveBeenCalledTimes(1);
    });
    it('recovers a mid-submit disconnect into already-paid status without confirming again', async () => {
        let interrupt;
        m.confirm.mockReturnValueOnce(new Promise((_resolve, reject) => { interrupt = reject; }));
        render(<CheckOut />);
        const pay = await screen.findByRole('button', { name: 'Pay Now' });
        await waitFor(() => expect(pay).toBeEnabled());
        fireEvent.click(pay);
        await waitFor(() => expect(m.confirm).toHaveBeenCalledTimes(1));
        await act(async () => {
            Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
            window.dispatchEvent(new Event('offline'));
            interrupt(new Error('Connection interrupted'));
        });
        expect(screen.getByRole('button', { name: 'Pay Now' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Check payment status' })).toBeEnabled();
        global.fetch.mockImplementation((url, options) => url === '/api/checkout/session'
            ? Promise.resolve(response({ attemptId: intent, sessionId: 'cs_one', alreadyPaid: true }))
            : fetchRoute(url, options));
        await act(async () => {
            Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
            window.dispatchEvent(new Event('online'));
        });
        expect(await screen.findByText('Already paid')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Pay Now' })).toBeNull();
        expect(m.confirm).toHaveBeenCalledTimes(1);
        const calls = global.fetch.mock.calls.filter(([url]) => url === '/api/checkout/session');
        expect(calls.map(([, options]) => options.headers['X-Checkout-Attempt'])).toEqual([intent, intent]);
    });
    it('does not confirm an already-paid session replayed from browser history', async () => {
        global.fetch.mockResolvedValue(response({ session: { status: 'complete', payment_status: 'paid' } }));
        const check = vi.fn();
        render(<CheckoutForm sessionId="cs_one" onCheckStatus={check} />);
        fireEvent.click(screen.getByRole('button', { name: 'Pay Now' }));
        await waitFor(() => expect(check).toHaveBeenCalled());
        expect(m.confirm).not.toHaveBeenCalled();
    });
    it('recovers return status failures and distinguishes processing from paid', async () => {
        m.params = new URLSearchParams('session_id=cs_one');
        global.fetch.mockRejectedValue(new Error('network'));
        render(<Return />);
        expect(await screen.findByRole('alert')).toHaveTextContent('Unable to connect');
        global.fetch.mockResolvedValue(response({ session: { id: 'cs_one', status: 'complete', payment_status: 'unpaid' } }));
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(await screen.findByText('Payment is processing')).toBeInTheDocument();
        expect(screen.queryByText('Thank you for your order')).toBeNull();
        global.fetch.mockResolvedValue(response({ session: { id: 'cs_one', status: 'complete', payment_status: 'paid' } }));
        fireEvent.click(screen.getByRole('button', { name: 'Check payment status' }));
        expect(await screen.findByText('Thank you for your order')).toBeInTheDocument();
        expect(global.fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
    });
    it('renders a useful error for a missing return session', async () => {
        render(<Return />);
        expect(await screen.findByRole('alert')).toHaveTextContent('payment link is incomplete');
        expect(global.fetch).not.toHaveBeenCalled();
    });
    it('never treats a paid response for another session as this order confirmation', async () => {
        m.params = new URLSearchParams('session_id=cs_one');
        global.fetch.mockResolvedValue(response({ session: { id: 'cs_other', status: 'complete', payment_status: 'paid' } }));
        render(<Return />);
        expect(await screen.findByText('Payment is processing')).toBeInTheDocument();
        expect(screen.queryByText('Thank you for your order')).toBeNull();
        expect(global.fetch.mock.calls.some(([url]) => String(url).endsWith('/measurement'))).toBe(false);
    });
});
