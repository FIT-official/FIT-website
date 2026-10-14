import { NextResponse } from 'next/server';
import { backorders, backordersEnabled } from '@/lib/shopBackorders/host';
import { connectToDatabase } from '@/lib/db';
import Product from '@/models/Product';
import { BackorderError } from '@/lib/shopBackorders/policy';
export const dynamic = 'force-dynamic';
const json = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(req) {
    if (!backordersEnabled()) return json({ enabled: false });
    try {
        const params = new URL(req.url).searchParams;
        const id = params.get('productId'), raw = params.get('variants') || '{}', quantity = Number(params.get('quantity'));
        if (!/^[a-f0-9]{24}$/i.test(id || '') || raw.length > 2000 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) return json({ error: 'Invalid selection.' }, 400);
        const variants = JSON.parse(raw);
        if (!variants || Array.isArray(variants) || typeof variants !== 'object' || Object.keys(variants).length > 5
            || Object.entries(variants).some(([k,v]) => k.length > 200 || typeof v !== 'string' || v.length > 200)) return json({ error: 'Invalid selection.' }, 400);
        await connectToDatabase();
        const product = await Product.findById(id).lean();
        if (!product || product.hidden || product.flaggedForModeration || product.productType !== 'shop' || product.listing === 'creator') return json({ error: 'Product unavailable.' }, 404);
        const quote = await (await backorders()).quote([{ _id: 'preview', productId: id, quantity, selectedVariants: variants, chosenDeliveryType: 'shipping' }]);
        return json({ enabled: true, allocation: quote.lines[0], checkedAt: quote.checkedAt });
    } catch (error) { return json({ error: error instanceof BackorderError ? error.message : 'Availability could not be checked.' }, error instanceof BackorderError ? error.status : 503); }
}
