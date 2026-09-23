import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const m = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), readiness: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({ auth: m.auth }));
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: m.admin }));
vi.mock('@/lib/storeReadiness', () => ({ getStoreReadiness: m.readiness }));
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }));
import StoreChecksPage from '@/app/admin/store-checks/page';

const passed = () => ({ ready: true, code: 'ready' });
const checks = () => ({ ready: true, checkoutTransactions: passed(), checkoutWebhook: passed(),
    subscriptionPrices: { standard: passed(), standardYearly: passed(), pro: passed(), proYearly: passed() },
    fabricationStorage: passed() });

beforeEach(() => {
    vi.clearAllMocks();
    m.auth.mockResolvedValue({ userId: 'admin-user' });
    m.admin.mockResolvedValue(true);
    m.readiness.mockResolvedValue(checks());
});
afterEach(cleanup);

describe('Admin store checks page', () => {
    it('does not run any probes for a signed-out visitor', async () => {
        m.auth.mockResolvedValue({ userId: null });
        render(await StoreChecksPage());
        expect(screen.getByRole('heading', { name: 'Sign in to view store checks' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in?redirect_url=%2Fadmin%2Fstore-checks');
        expect(m.admin).not.toHaveBeenCalled();
        expect(m.readiness).not.toHaveBeenCalled();
    });

    it('does not run probes or show their results to a non-admin user', async () => {
        m.admin.mockResolvedValue(false);
        render(await StoreChecksPage());
        expect(screen.getByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
        expect(m.admin).toHaveBeenCalledWith('admin-user');
        expect(m.readiness).not.toHaveBeenCalled();
        expect(screen.queryByText('Order storage')).not.toBeInTheDocument();
    });

    it('fails closed without exposing an authentication provider error', async () => {
        m.auth.mockRejectedValueOnce(new Error('private-auth-value'));
        render(await StoreChecksPage());
        expect(screen.getByRole('heading', { name: 'Admin access could not be verified' })).toBeInTheDocument();
        expect(screen.queryByText(/private-auth-value/)).not.toBeInTheDocument();
        expect(m.readiness).not.toHaveBeenCalled();
    });

    it('runs probes only after admin verification and renders all seven checks without a JSON fetch', async () => {
        const fetch = vi.spyOn(globalThis, 'fetch');
        render(await StoreChecksPage());
        expect(m.admin.mock.invocationCallOrder[0]).toBeLessThan(m.readiness.mock.invocationCallOrder[0]);
        expect(m.readiness).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Store payment checks passed.')).toBeInTheDocument();
        expect(screen.getAllByText('Passed')).toHaveLength(7);
        expect(screen.getByRole('heading', { name: 'Standard · monthly' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Standard · yearly' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Pro · monthly' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Pro · yearly' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Run checks again' })).toHaveAttribute('href', '/admin/store-checks');
        expect(screen.getByText(/not delivery of a payment notification/)).toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalled();
        fetch.mockRestore();
    });

    it('shows deferred uploads separately while keeping passed payment checks clear', async () => {
        const result = checks();
        result.ready = false;
        result.fabricationStorage = { ready: false, code: 'fabrication_storage_not_configured' };
        m.readiness.mockResolvedValue(result);
        render(await StoreChecksPage());
        expect(screen.getByText('Deferred')).toBeInTheDocument();
        expect(screen.getByText('Store payment checks passed.')).toBeInTheDocument();
        expect(screen.getByText(/Written requests, service listings and pricing remain available/)).toBeInTheDocument();
        expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
    });

    it.each(['checkoutTransactions', 'checkoutWebhook', 'price'])('does not let deferred uploads hide a failed %s check', async field => {
        const result = checks();
        result.ready = false;
        result.fabricationStorage = { ready: false, code: 'fabrication_storage_not_configured' };
        if (field === 'price') result.subscriptionPrices.proYearly = { ready: false, code: 'price_invalid' };
        else result[field] = { ready: false, code: 'unavailable' };
        m.readiness.mockResolvedValue(result);
        render(await StoreChecksPage());
        expect(screen.getByText('Store payment checks need attention.')).toBeInTheDocument();
        expect(screen.getByText('Needs attention')).toBeInTheDocument();
        expect(screen.getByText('Deferred')).toBeInTheDocument();
        expect(screen.queryByText('Store payment checks passed.')).not.toBeInTheDocument();
    });

    it('does not treat an unverified configured storage policy as a planned deferral', async () => {
        const result = checks();
        result.fabricationStorage = { ready: false, code: 'fabrication_storage_unverified' };
        m.readiness.mockResolvedValue(result);
        render(await StoreChecksPage());
        expect(screen.queryByText('Deferred')).not.toBeInTheDocument();
        expect(screen.getByText('Needs attention')).toBeInTheDocument();
        expect(screen.getByText(/Private storage could not be verified/)).toBeInTheDocument();
    });

    it('renders only known status descriptions and never diagnostic extras', async () => {
        const result = checks();
        result.internal = 'private-customer-data';
        result.subscriptionPrices.standard = { ready: false, code: 'sk_secret', priceId: 'price_secret', url: 'https://x?key=secret' };
        m.readiness.mockResolvedValue(result);
        const { container } = render(await StoreChecksPage());
        for (const value of ['private-customer-data', 'sk_secret', 'price_secret', 'https://x?key=secret']) {
            expect(container.textContent).not.toContain(value);
        }
        expect(screen.getByText(/This subscription price could not be verified/)).toBeInTheDocument();
    });

    it('shows a safe failure if the shared probes unexpectedly reject', async () => {
        m.readiness.mockRejectedValueOnce(new Error('private-provider-value'));
        render(await StoreChecksPage());
        expect(screen.getByRole('heading', { name: 'Store checks are unavailable' })).toBeInTheDocument();
        expect(screen.queryByText(/private-provider-value/)).not.toBeInTheDocument();
    });
});
