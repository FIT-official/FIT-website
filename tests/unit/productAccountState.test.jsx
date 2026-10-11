import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useUser } from '@clerk/nextjs';

vi.mock('@clerk/nextjs', () => ({ useUser: vi.fn() }));
vi.mock('next/navigation', () => ({ useParams: () => ({ slug: 'synthetic-digital' }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));
vi.mock('@/components/3D/ModelViewer', () => ({ default: () => null }));
vi.mock('@/components/ProductPage/ReviewSection', () => ({ default: ({ userOrders }) => <output data-testid="review-orders">{JSON.stringify(userOrders)}</output> }));
import ProductPage from '@/app/products/[slug]/ProductPage';

const product = { _id: 'synthetic-product', slug: 'synthetic-digital', name: 'Synthetic digital product', productType: 'shop', creatorUserId: 'synthetic-creator', basePrice: { presentmentAmount: 1, presentmentCurrency: 'SGD' }, images: [], variantTypes: [], infiniteStock: true, delivery: { deliveryTypes: [{ type: 'digital' }] } };
let viewer, requests;
function setViewer(id) {
    viewer = id;
    useUser.mockReturnValue({ user: id ? { id } : null, isLoaded: true, isSignedIn: Boolean(id) });
}
async function reply(kind, id, body, ok = true) {
    await waitFor(() => expect(requests.find(r => r.kind === kind && r.id === id && !r.used)).toBeTruthy());
    const request = requests.find(r => r.kind === kind && r.id === id && !r.used);
    request.used = true;
    await act(async () => request.resolve({ ok, json: async () => body }));
}
beforeEach(() => {
    requests = [];
    setViewer('customer-a');
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('fetch', vi.fn(url => {
        const kind = String(url).startsWith('/api/user/owns-product') ? 'owns' : String(url).startsWith('/api/order?') ? 'orders' : null;
        if (kind) return new Promise(resolve => requests.push({ kind, id: viewer, resolve }));
        return Promise.resolve({ ok: true, json: async () => String(url).startsWith('/api/product?') ? { product } : {} });
    }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('product account changes', () => {
    it('removes the previous purchase and review history on sign-out', async () => {
        const view = render(<ProductPage initialProduct={product} />);
        await reply('owns', 'customer-a', { owns: true });
        await reply('orders', 'customer-a', { orders: [{ _id: 'private-order-a' }] });
        expect(screen.getByRole('button', { name: 'View in Downloads' })).toBeInTheDocument();
        setViewer(null); view.rerender(<ProductPage initialProduct={product} />);
        expect(screen.queryByRole('button', { name: 'View in Downloads' })).not.toBeInTheDocument();
        expect(screen.getByTestId('review-orders')).toHaveTextContent('[]');
        expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeEnabled();
    });
    it('does not display an old purchase while the next account is checked', async () => {
        const view = render(<ProductPage initialProduct={product} />);
        await reply('owns', 'customer-a', { owns: true });
        setViewer('customer-b'); view.rerender(<ProductPage initialProduct={product} />);
        expect(screen.queryByRole('button', { name: 'View in Downloads' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Checking availability' })).toBeDisabled();
        await reply('owns', 'customer-b', { owns: false });
        expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeEnabled();
    });
    it('ignores a late purchase response from the previous account', async () => {
        const view = render(<ProductPage initialProduct={product} />);
        await waitFor(() => expect(requests.some(r => r.kind === 'owns' && r.id === 'customer-a')).toBe(true));
        setViewer('customer-b'); view.rerender(<ProductPage initialProduct={product} />);
        await reply('owns', 'customer-b', { owns: false });
        await reply('owns', 'customer-a', { owns: true });
        expect(screen.queryByRole('button', { name: 'View in Downloads' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeEnabled();
    });
    it('keeps review eligibility attached to the current account when requests race', async () => {
        const view = render(<ProductPage initialProduct={product} />);
        await waitFor(() => expect(requests.some(r => r.kind === 'orders' && r.id === 'customer-a')).toBe(true));
        setViewer('customer-b'); view.rerender(<ProductPage initialProduct={product} />);
        await reply('orders', 'customer-b', { orders: [{ _id: 'private-order-b' }] });
        await reply('orders', 'customer-a', { orders: [{ _id: 'private-order-a' }] });
        expect(screen.getByTestId('review-orders')).toHaveTextContent('private-order-b');
        expect(screen.getByTestId('review-orders')).not.toHaveTextContent('private-order-a');
    });
    it('does not treat an unsuccessful ownership response as a purchase', async () => {
        render(<ProductPage initialProduct={product} />);
        await reply('owns', 'customer-a', { owns: true }, false);
        expect(screen.queryByRole('button', { name: 'View in Downloads' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeEnabled();
    });
});
