import { NextResponse } from 'next/server';
import { shippingFixturesEnabled } from '../../../../fixtureGuard.mjs';
import { shippingFixture, fixtureCases } from '../../../../fixtures';
import { calculateCartItemBreakdown } from '@/app/api/checkout/calculateBreakdown';
import { applyShopShipping } from '@/lib/shopShipping';

// This isolated Next app imports the actual cart/pricing code, never the real
// API handlers, database connector, authentication provider or payment client.
export async function GET(req) {
    if (!shippingFixturesEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const scenario = req.cookies.get('shipping-fixture')?.value || 'small-item';
    if (!Object.hasOwn(fixtureCases, scenario)) return NextResponse.json({ error: 'Unknown fixture' }, { status: 400 });
    const { cart, products } = shippingFixture(scenario);
    const path = new URL(req.url).pathname;
    if (path === '/api/user/cart') return NextResponse.json({ cart, guest: true });
    if (path === '/api/product') return NextResponse.json({ products });
    if (path === '/api/delivery-types') return NextResponse.json({ deliveryTypes: [
        { name: 'standard-shipping', displayName: 'Standard delivery' },
        { name: 'express-courier', displayName: 'Express Courier' },
        { name: 'pick-up', displayName: 'Self Pick Up' },
    ] });
    if (path === '/api/checkout/breakdown') {
        const lines = await Promise.all(cart.map(async (item, i) => ({ product: products[i],
            breakdown: await calculateCartItemBreakdown({ item, product: products[i], address: null }),
        })));
        applyShopShipping(lines, null);
        return NextResponse.json({ cartBreakdown: lines.map(line => line.breakdown), addressMissing: true, needsDeliveryAddress: true, address: null });
    }
    return NextResponse.json({ error: 'Unavailable in the local cart preview' }, { status: 404 });
}

export async function POST() {
    return NextResponse.json({ error: 'Payments and cart mutations are disabled in this local preview' }, { status: 403 });
}
export const PUT = POST;
export const DELETE = POST;
