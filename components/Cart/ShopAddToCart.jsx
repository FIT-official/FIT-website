'use client';
import { addShopItem } from '@/lib/storeRequest';
import { ConnectionNotice, useStoreConnection } from './StoreFeedback';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getDefaultVariantSelections } from '@/lib/seo/product';
import { productVariantLabel } from '@/lib/productVariantLabel';

export default function ShopAddToCart({ product }) {
    const router = useRouter();
    const [variants, setVariants] = useState(() => getDefaultVariantSelections(product));
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [added, setAdded] = useState(false);
    const lock = useRef(false);
    const offline = useStoreConnection();
    const unavailable = !product.infiniteStock && (product.stock === 0 || product.variantTypes?.some(v =>
        v.options?.find(o => o.name === variants[v.name])?.stock === 0));
    async function add(buyNow = false) {
        if (lock.current) return;
        lock.current = true;
        setBusy(true); setMessage(''); setAdded(false);
        try {
            await addShopItem({ productId: product._id, quantity: 1,
                selectedVariants: variants, chosenDeliveryType: product.delivery?.deliveryTypes?.[0]?.type || 'selfCollect' });
            setAdded(true);
            if (buyNow) router.push('/checkout');
        } catch (error) { setMessage(error.message || 'Unable to reach the shop. Please try again.'); }
        finally { lock.current = false; setBusy(false); }
    }
    return <div className="flex flex-col gap-2 mt-3 w-full" onClick={e => e.stopPropagation()}>
        <ConnectionNotice offline={offline} />
        {(product.variantTypes || []).map(v => <label key={v.name} className="text-sm">{productVariantLabel(product, v)}
            <select aria-label={`${product.name} ${productVariantLabel(product, v)}`} value={variants[v.name] || ''} disabled={busy}
                className="border rounded p-2 w-full" onChange={e => { setVariants({ ...variants, [v.name]: e.target.value }); setAdded(false); }}>
                {v.options.map(o => <option key={o.name} value={o.name}>{o.name}{o.additionalFee > 0 ? ` (+S$${o.additionalFee.toFixed(2)})` : ''}</option>)}
            </select>
        </label>)}
        <button type="button" className="formBlackButton justify-center" disabled={busy || unavailable || offline} onClick={() => add()}>
            {busy ? 'Adding to cart…' : unavailable ? 'Out of stock' : 'Add to Cart'}
        </button>
        <button type="button" className="formWhiteButton justify-center" disabled={busy || unavailable || offline} onClick={() => add(true)}>Buy Now</button>
        {added && <p role="status">Added to cart. <Link className="underline" href="/cart">View cart</Link></p>}
        {message && <p role="alert">{message} <Link className="underline" href="/cart">Check cart</Link></p>}
    </div>;
}
