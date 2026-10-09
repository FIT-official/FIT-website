import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ShopPage from '@/app/shop/ShopPage';
const content = vi.hoisted(() => ({ bannerImage: '' }));
vi.mock('@/utils/useContent', () => ({ useContent: () => ({ content }) }));
vi.mock('@/utils/useInventoryRefresh', () => ({ useInventoryRefresh: () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/ProductCard', () => ({ default: () => null }));
vi.mock('next/image', () => ({
    // eslint-disable-next-line @next/next/no-img-element
    default: ({ src, alt, onLoad, onError }) => <img src={src} alt={alt} onLoad={onLoad} onError={onError} />,
}));
afterEach(cleanup);
it.each(['', '/placeholder.jpg'])('omits empty or placeholder banner %s', image => {
    content.bannerImage = image;
    const { container } = render(<ShopPage />);
    expect(screen.queryByAltText('Banner')).toBeNull();
    expect(container.querySelector('.aspect-16\\/5')).toBeNull();
});
it('removes a failed banner and its reserved space instead of showing the cat photo', () => {
    content.bannerImage = 'admin/uploads/shop/banner/missing.jpg';
    const { container } = render(<ShopPage />);
    const image = screen.getByAltText('Banner');
    expect(image.getAttribute('src')).toContain('/api/proxy?key=');
    fireEvent.error(image);
    expect(screen.queryByAltText('Banner')).toBeNull();
    expect(container.querySelector('.aspect-16\\/5')).toBeNull();
});
