import { expect, it, vi, afterEach } from 'vitest';
import { shippingFixturesEnabled } from '@/scripts/shipping/fixtureGuard.mjs';
import { shippingFixture, fixtureCases } from '@/scripts/shipping/fixtures';
import { calculateCartItemBreakdown } from '@/app/api/checkout/calculateBreakdown';
import { applyShopShipping } from '@/lib/shopShipping';
import { GET, POST } from '@/scripts/shipping/preview/app/api/[...path]/route';

afterEach(() => vi.unstubAllEnvs());

it.each([
    ['development', '1', true], ['production', '1', false], ['test', '1', false],
    ['development', undefined, false], ['development', 'true', false], [undefined, '1', false],
])('guards fixtures with NODE_ENV=%s and SHIPPING_FIXTURES=%s', (NODE_ENV, SHIPPING_FIXTURES, allowed) => {
    expect(shippingFixturesEnabled({ NODE_ENV, SHIPPING_FIXTURES })).toBe(allowed);
});

it('refuses the fixture API in production even with the flag enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('SHIPPING_FIXTURES', '1');
    expect((await GET()).status).toBe(404);
    expect((await POST()).status).toBe(403);
});

it.each(Object.keys(fixtureCases))('renders real server pricing for %s', async key => {
    const { cart, products } = shippingFixture(key);
    const lines = await Promise.all(cart.map(async (item, i) => ({ product: products[i],
        breakdown: await calculateCartItemBreakdown({ item, product: products[i], address: null }),
    })));
    applyShopShipping(lines, null);
    expect(Math.round(lines.reduce((sum, line) => sum + line.breakdown.deliveryFee, 0) * 100)).toBe(fixtureCases[key].expectedShippingCents);
});
