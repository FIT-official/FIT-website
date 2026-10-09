import Link from 'next/link';
import home from '@/components/Home/v2/home.module.css';
import './dashboard.css';
export const cardClass = `${home.serviceCard} ${home.cardBody} cd-card`;
export const buttonClass = home.button;
export function StatusBadge({ status = 'unknown' }) {
    const label = status.toLowerCase();
    return <span className={`cd-badge cd-${label}`}>{label.replaceAll('_', ' ')}</span>;
}
export default function DashboardFrame({ title, owner = false, fixture = false, publicTracking = false, children }) {
    const base = owner ? '/admin/creator-dashboard' : '/dashboard/creator';
    return <main className={`${home.home} cd-root`}>
        <section className={`${home.hero} cd-hero`}>
            <div className={home.heroContent}>
                <p className={home.eyebrow}>{publicTracking ? 'Order tracking' : owner ? 'Fix It Today · Workshop' : 'Fix It Today · Your store'}</p>
                <h1>{title}</h1>
                <p className={home.heroPromise}>{publicTracking ? 'From a design to a finished print.' : owner ? 'Orders, printers and fulfilment across your community.' : 'Your orders, your printers, your next creation.'}</p>
            </div>
        </section>
        {!publicTracking && <nav className="cd-nav" aria-label="Creator workspace">
            <Link href={base}>Overview</Link><Link href={`${base}/orders`}>Orders</Link>
            <Link href={owner ? `${base}/queue` : `${base}/jobs`}>Print queue</Link>
            <Link href={`${base}/fleet`}>Printer fleet</Link><Link href={`${base}/payouts`}>Payouts</Link>
            <Link href="/dashboard/creator/uploads">Uploads</Link>
            {owner && <Link href={`${base}/materials`}>Materials</Link>}
            <Link href={owner ? '/admin' : '/dashboard/products'}>{owner ? 'Shop admin' : 'My products'}</Link>
        </nav>}
        <section className={`${home.section} cd-content`}>
            {fixture && <p className="cd-notice">Demo workspace · sample data · changes are disabled</p>}
            {children}
        </section>
    </main>;
}
