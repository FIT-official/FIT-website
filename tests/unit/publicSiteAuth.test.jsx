import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UserRoleProvider, useUserRole } from '@/utils/UserRoleContext';
import { AdminSettingsProvider, useAdminSettings } from '@/utils/AdminSettingsContext';
import { CurrencyProvider, useCurrency } from '@/components/General/CurrencyContext';
import { getAllCategories, getAllSubcategories } from '@/lib/categoriesHelper';
const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: false, user: null }));
vi.mock('@clerk/nextjs', () => ({ useUser: () => auth }));

function Probe() {
    const role = useUserRole();
    const admin = useAdminSettings();
    return <output>{JSON.stringify({ role: role.role, loading: role.loading, settings: admin.settings })}</output>;
}
function Providers() { return <UserRoleProvider><AdminSettingsProvider><Probe /></AdminSettingsProvider></UserRoleProvider>; }
beforeEach(() => {
    Object.assign(auth, { isLoaded: true, isSignedIn: false, user: null });
    vi.stubGlobal('fetch', vi.fn());
    sessionStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('does not fetch auth or admin endpoints before Clerk loads or when signed out', async () => {
    auth.isLoaded = false;
    const { rerender } = render(<Providers />);
    expect(fetch).not.toHaveBeenCalled();
    auth.isLoaded = true;
    rerender(<Providers />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('"loading":false'));
    expect(fetch).not.toHaveBeenCalled();
});
it('loads roles for customers but never requests admin settings', async () => {
    Object.assign(auth, { isSignedIn: true, user: { id: 'customer' } });
    fetch.mockResolvedValue({ ok: true, json: async () => ({ role: 'user' }) });
    render(<Providers />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('"role":"user"'));
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['/api/user/role']);
});
it('loads admin settings only after an admin role and clears them on sign-out', async () => {
    Object.assign(auth, { isSignedIn: true, user: { id: 'administrator' } });
    fetch.mockImplementation(async url => ({ ok: true, json: async () =>
        url === '/api/user/role' ? { role: 'admin' } : { categories: [] } }));
    const { rerender } = render(<Providers />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('"categories":[]'));
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['/api/user/role', '/api/admin/settings']);
    Object.assign(auth, { isSignedIn: false, user: null });
    rerender(<Providers />);
    expect(screen.getByRole('status')).toHaveTextContent('"settings":null');
    expect(fetch).toHaveBeenCalledTimes(2);
});
it('ignores a late role response after sign-out', async () => {
    Object.assign(auth, { isSignedIn: true, user: { id: 'administrator' } });
    let resolve;
    fetch.mockReturnValue(new Promise(done => { resolve = done; }));
    const { rerender } = render(<Providers />);
    Object.assign(auth, { isSignedIn: false, user: null });
    rerender(<Providers />);
    await act(async () => resolve({ ok: true, json: async () => ({ role: 'admin' }) }));
    expect(screen.getByRole('status')).toHaveTextContent('"role":null');
    expect(fetch).toHaveBeenCalledTimes(1);
});
it('does not carry an admin role across an account switch', async () => {
    Object.assign(auth, { isSignedIn: true, user: { id: 'administrator' } });
    fetch.mockImplementation(async url => ({ ok: true, json: async () =>
        url === '/api/user/role' ? { role: auth.user.id === 'administrator' ? 'admin' : 'user' } : {} }));
    const { rerender } = render(<Providers />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    auth.user = { id: 'customer' };
    rerender(<Providers />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('"role":"user"'));
    expect(fetch.mock.calls.filter(call => call[0] === '/api/admin/settings')).toHaveLength(1);
});
it('loads public categories and subcategories without admin requests', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ categories: [] }) });
    await getAllCategories('shop');
    await getAllSubcategories('shop', 0);
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['/api/categories', '/api/categories']);
});
it('caches the display currency across mounts without a third-party request', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ currency: 'SGD' }) });
    function Currency() { return <output>{useCurrency()}</output>; }
    const first = render(<CurrencyProvider><Currency /></CurrencyProvider>);
    await waitFor(() => expect(sessionStorage.getItem('fit-display-currency')).toBe('SGD'));
    first.unmount();
    render(<CurrencyProvider><Currency /></CurrencyProvider>);
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['/api/display-currency']);
});
