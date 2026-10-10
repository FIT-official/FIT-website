import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen, within, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { shippingFixture, fixtureCases } from '@/scripts/shipping/fixtures';
import { calculateCartItemBreakdown } from '@/app/api/checkout/calculateBreakdown';
import { applyShopShipping } from '@/lib/shopShipping';

vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: null, isLoaded: true }) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('next/link', () => ({ default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a> }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));
vi.mock('@/components/General/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/components/General/CurrencyContext', () => ({ useCurrency: () => 'SGD' }));
vi.mock('@/components/Cart/CustomPrintUpload', () => ({ default: () => null }));
import Cart from '@/app/cart/Cart';

let data;
beforeEach(() => {
    data = shippingFixture('small-item');
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
        const json = body => ({ ok: true, status: 200, json: async () => structuredClone(body) });
        if (url === '/api/user/cart') return json({ cart: data.cart });
        if (url.startsWith('/api/product?')) return json({ products: data.products });
        if (url === '/api/delivery-types') return json({ deliveryTypes: [{ name: 'standard-shipping', description: 'No tracking' }] });
        if (url === '/api/checkout/breakdown') {
            const lines = await Promise.all(data.cart.map(async (item, i) => ({ product: data.products[i],
                breakdown: await calculateCartItemBreakdown({ item, product: data.products[i], address: null }),
            })));
            applyShopShipping(lines, null);
            return json({ cartBreakdown: lines.map(line => line.breakdown), addressMissing: true, needsDeliveryAddress: true });
        }
        if (url === '/api/user/cart/delivery') {
            data.cart[0].chosenDeliveryType = JSON.parse(init.body).chosenDeliveryType;
            return json({ success: true });
        }
        throw new Error(`Unexpected request: ${url}`);
    }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(Object.keys(fixtureCases))('shows the computed option and summary for %s, replacing stale copy', async key => {
    data = shippingFixture(key);
    render(<Cart />);
    const delivery = await screen.findByTestId('summary-delivery');
    const price = fixtureCases[key].expectedShippingCents === 0 ? 'Free' : `SGD ${(fixtureCases[key].expectedShippingCents / 100).toFixed(2)}`;
    expect(within(delivery).getByText(price)).toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: new RegExp(`Standard delivery.*${price.replace('.', '\\.')}`) }).length).toBe(data.cart.length);
    expect(screen.queryByText(/No tracking/)).not.toBeInTheDocument();
    expect(delivery).toHaveTextContent(key === 'small-item' ? 'Tracked, delivered to your letterbox' : 'Tracked, next working day');
    expect(screen.getAllByTestId('summary-delivery')).toHaveLength(1);
});

it('disables a blocked standard option and checkout, then permits pickup', async () => {
    Object.assign(data.products[0], { shippingWeightG: 31000 });
    render(<Cart />);
    const delivery = await screen.findByTestId('summary-delivery');
    expect(delivery).toHaveTextContent('Contact us for a delivery quote');
    expect(screen.getByRole('option', { name: /Contact us for a delivery quote/ })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Proceed to Checkout' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Quote required')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Change delivery type' }), { target: { value: 'pick-up' } });
    await waitFor(() => expect(screen.getByRole('link', { name: 'Proceed to Checkout' })).toHaveAttribute('aria-disabled', 'false'));
    expect(screen.getByTestId('summary-delivery')).toHaveTextContent('SGD 0.00');
});
