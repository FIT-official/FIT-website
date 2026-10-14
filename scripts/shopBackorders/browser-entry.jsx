import React from 'react';
import { createRoot } from 'react-dom/client';
import ShopAddToCart from '../../components/Cart/ShopAddToCart';
import Cart from '../../app/cart/Cart';
import CheckOut from '../../app/checkout/CheckOut';
import BackordersPage from '../../app/admin/shop-backorders/page';
const product = window.__SYNTHETIC_PRODUCT__;
const mode = new URLSearchParams(location.search).get('mode');
createRoot(document.getElementById('root')).render(<><aside style={{ padding: 12, background: '#fff3ce' }}>Synthetic local shop fixture · No live payment, customer or inventory</aside>
    {mode === 'cart' ? <Cart /> : mode === 'checkout' ? <CheckOut /> : mode === 'owner' ? <BackordersPage /> : <main style={{ maxWidth: 600, padding: 24, margin: 'auto' }}><h1>{product.name}</h1><p>S$10 per unit · synthetic test price</p><ShopAddToCart product={product} /></main>}</>);
