import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShopAddToCart from '@/components/Cart/ShopAddToCart';

const { addShopItem } = vi.hoisted(() => ({ addShopItem: vi.fn() }));
vi.mock('@/lib/storeRequest', () => ({ addShopItem }));
vi.mock('@/components/Cart/StoreFeedback', () => ({ ConnectionNotice: () => null, useStoreConnection: () => false }));
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }));

function fixture() {
  return {
    _id: 'fixture-basic', name: 'Fixture PLA Basic', slug: 'bambu-lab-3d-printing-filament-1kg-pla-basic',
    productType: 'shop', stock: 10, basePrice: { presentmentAmount: 21.9, presentmentCurrency: 'SGD' },
    delivery: { deliveryTypes: [{ type: 'fixture-pickup', price: 0 }] },
    variantTypes: [
      { name: 'Spool', options: [{ name: 'Jade White (10100)', stock: 10, additionalFee: 0 }, { name: 'Black (10101)', stock: 10, additionalFee: 0 }] },
      { name: 'Colour', options: [{ name: 'With Spool', stock: 10, additionalFee: 4 }, { name: 'Without Spool', stock: 10, additionalFee: 0 }] },
    ],
  };
}
beforeEach(() => { cleanup(); addShopItem.mockReset().mockResolvedValue({}); });
describe('inline shop variant labels', () => {
  it('adds a guest shop item with standard delivery when express is listed first', async () => {
    const product = fixture();
    product.delivery.deliveryTypes = [{ type: 'express-courier', price: 30 }, { type: 'standard-shipping', price: 6.2 }, { type: 'pick-up', price: 0 }];
    render(<ShopAddToCart product={product} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));
    await waitFor(() => expect(addShopItem).toHaveBeenCalledWith(expect.objectContaining({ chosenDeliveryType: 'standard-shipping' })));
  });
  it('labels the verified legacy PLA Basic colour and packing selects correctly for screen readers', () => {
    render(<ShopAddToCart product={fixture()} />);
    expect(screen.getByRole('combobox', { name: 'Fixture PLA Basic Colour' })).toHaveValue('Jade White (10100)');
    expect(screen.getByRole('combobox', { name: 'Fixture PLA Basic Spool' })).toHaveValue('With Spool');
    expect(screen.getByRole('option', { name: 'With Spool (+S$4.00)' })).toBeInTheDocument();
  });
  it('retains the original stored selection keys and exact choices in the mocked cart request', async () => {
    const product = fixture();
    const before = JSON.stringify(product);
    render(<ShopAddToCart product={product} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Fixture PLA Basic Colour' }), { target: { value: 'Black (10101)' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Fixture PLA Basic Spool' }), { target: { value: 'Without Spool' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));
    await waitFor(() => expect(addShopItem).toHaveBeenCalledOnce());
    expect(addShopItem).toHaveBeenCalledWith({ productId: 'fixture-basic', quantity: 1, selectedVariants: { Spool: 'Black (10101)', Colour: 'Without Spool' }, chosenDeliveryType: 'fixture-pickup' });
    expect(JSON.stringify(product)).toBe(before);
  });
  it('keeps unrelated product labels unchanged', () => {
    const product = fixture(); product.slug = 'unrelated-product';
    render(<ShopAddToCart product={product} />);
    expect(screen.getByRole('combobox', { name: 'Fixture PLA Basic Spool' })).toHaveValue('Jade White (10100)');
    expect(screen.getByRole('combobox', { name: 'Fixture PLA Basic Colour' })).toHaveValue('With Spool');
  });
});
