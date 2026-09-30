import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PricingFields from '@/components/DashboardComponents/ProductFormFields/PricingFields';
afterEach(cleanup);
it('accepts and preserves existing decimal credit values when saving a product', () => {
    const setForm = vi.fn();
    render(<PricingFields form={{ priceCredits: 7.4, basePrice: { presentmentAmount: 7.4 } }} setForm={setForm} allCurrencies={['SGD']} />);
    const credits = screen.getByLabelText('Credits Amount');
    expect(credits.checkValidity()).toBe(true);
    fireEvent.change(credits, { target: { value: '11.90' } });
    expect(setForm.mock.calls[0][0]({ priceCredits: 7.4 }).priceCredits).toBe(11.9);
});
