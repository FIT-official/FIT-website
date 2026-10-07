import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Main from '@/components/Home/Main';
// Use the actual motion renderer: mocking it would conceal hidden SSR styles.
vi.mock('next/image', () => ({ default: () => null }));
it('keeps the brand and subtitle visible in server HTML without executing JavaScript', () => {
    const html = renderToStaticMarkup(<Main initialHeroContent={{ text: 'Printer repair and filament', heroImage: null }} />);
    expect(html).toContain('Printer repair and filament');
    expect(html).not.toContain('translateY(100%)');
    expect(html).not.toContain('opacity:0');
});
