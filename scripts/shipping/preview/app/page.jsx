import { Suspense } from 'react';
import { CartContent } from '@/app/cart/Cart';

export default function ShippingCart() {
    return <Suspense><CartContent user={null} isLoaded /></Suspense>;
}
