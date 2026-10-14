import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ stripe: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }));
vi.mock('@stripe/stripe-js', () => ({ loadStripe: mocks.stripe }));
vi.mock('@stripe/react-stripe-js', () => ({ CheckoutProvider: ({ children }) => <div>{children}</div>, PaymentElement: () => <div>Payment widget</div>, useCheckout: () => ({}) }));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));
import ShopAddToCart from '@/components/Cart/ShopAddToCart';
import CartQuantityEditor from '@/components/Cart/CartQuantityEditor';
import CheckOut from '@/app/checkout/CheckOut';
import StockAllocation from '@/components/Cart/StockAllocation';
import { RESTOCKING_DISCLOSURE, RESTOCKING_VERSION } from '@/lib/shopBackorders/policy';
const product = { _id: '0123456789abcdef01234567', name: 'Synthetic filament', productType: 'shop', stock: 2,
    variantTypes: [{ name: 'Colour', options: [{ name: 'Blue', stock: 2 }, { name: 'Red', stock: 0 }] }],
    delivery: { deliveryTypes: [{ type: 'pick-up', price: 0 }] } };
const allocation = { availableQuantity: 2, onHandQuantity: 2, backorderQuantity: 3, quantity: 5, blocked: false, disclosure: RESTOCKING_DISCLOSURE };
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('Shop quantity and disclosure UI', () => {
    it('adds the chosen quantity and variant and reviews sold-out variants', async () => {
        vi.stubGlobal('fetch', vi.fn(async url => {
            if (url.startsWith('/api/shop/availability')) return response({ enabled: true, allocation });
            return response({ success: true, cart: [] });
        }));
        render(<ShopAddToCart product={product} />);
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
        expect(await screen.findByText(RESTOCKING_DISCLOSURE)).toBeInTheDocument();
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Red' } });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeEnabled());
        fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));
        await screen.findByRole('status');
        const saved = global.fetch.mock.calls.find(([, options]) => options.method === 'POST');
        expect(JSON.parse(saved[1].body).cartItem).toMatchObject({ quantity: 5, selectedVariants: { Colour: 'Red' } });
    });
    it('blocks known non-restockable excess and invalid numeric input', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => response({ enabled: true, allocation: { ...allocation, blocked: true, issue: 'This selection will not be restocked.' } })));
        render(<ShopAddToCart product={product} />);
        expect(await screen.findByRole('alert')).toHaveTextContent('will not be restocked');
        expect(screen.getByRole('button')).toBeDisabled();
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1.5' } });
        expect(screen.getByRole('button')).toBeDisabled();
    });
    it('saves an exact cart quantity and surfaces stale-edit rejection without hiding the input', async () => {
        const save = vi.fn().mockRejectedValue(Error('Changed in another tab.'));
        render(<CartQuantityEditor quantity={2} onSave={save} />);
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } }); fireEvent.blur(screen.getByRole('spinbutton'));
        expect(await screen.findByRole('alert')).toHaveTextContent('Changed in another tab'); expect(save).toHaveBeenCalledWith(7);
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '101' } }); fireEvent.blur(screen.getByRole('spinbutton'));
        expect(screen.getByRole('alert')).toHaveTextContent('1 to 100'); expect(save).toHaveBeenCalledTimes(1);
    });
    it('requires a new acknowledgement when stock changes and keeps Stripe unloaded before review', async () => {
        let version = 0;
        vi.stubGlobal('fetch', vi.fn(async url => {
            if (url === '/api/user/cart') return response({ cart: [{ quantity: 5 }], checkoutAttemptId: '00000000-0000-4000-8000-000000000001' });
            if (url === '/api/checkout/session') { version++; return response({ code: 'stock_quote_changed', error: 'Review stock.' }, 409); }
            if (url === '/api/checkout/breakdown') return response({ stockQuote: { token: String(version), requiresAcknowledgement: true, disclosureVersion: RESTOCKING_VERSION }, cartBreakdown: [{ name: 'Synthetic filament', quantity: 5, price: 10, deliveryFee: 0, stockAllocation: allocation }] });
            throw Error('Unexpected request ' + url);
        }));
        render(<CheckOut />);
        const check = await screen.findByRole('checkbox');
        const button = screen.getByRole('button', { name: 'Continue to payment' });
        expect(button).toBeDisabled(); expect(mocks.stripe).not.toHaveBeenCalled();
        fireEvent.click(check); expect(button).toBeEnabled(); fireEvent.click(button);
        await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked());
        const last = global.fetch.mock.calls.filter(([url]) => url === '/api/checkout/session').at(-1);
        expect(last[1].headers).toMatchObject({ 'X-Stock-Quote': '1', 'X-Restocking-Acknowledged': RESTOCKING_VERSION });
        expect(screen.getByRole('button', { name: 'Continue to payment' })).toBeDisabled(); expect(mocks.stripe).not.toHaveBeenCalled();
    });
    it('shows original and fulfilled quantities without rewriting the original notice', () => {
        render(<StockAllocation allocation={allocation} fulfillment={{ allocated: 2 }} />);
        expect(screen.getByText('From available stock: 2. Awaiting restock: 1.')).toBeInTheDocument();
        expect(screen.getByText('Allocated after restocking: 2.')).toBeInTheDocument();
        expect(screen.getByText(RESTOCKING_DISCLOSURE)).toBeInTheDocument();
    });
});
