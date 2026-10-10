import { notFound } from 'next/navigation';
import { shippingFixturesEnabled } from '../../fixtureGuard.mjs';
import { ToastProvider } from '@/components/General/ToastProvider';
import './styles.css';

export const metadata = { title: 'Cart · Fix It Today', robots: { index: false, follow: false } };

export default function Layout({ children }) {
    if (!shippingFixturesEnabled()) notFound();
    return <html lang="en"><body><ToastProvider>{children}</ToastProvider></body></html>;
}
