import Link from 'next/link';
import './dashboard.css';
export function StatusBadge({ status }) {
    return <span className={`cd-badge cd-${status}`}>{status.replaceAll('_', ' ')}</span>;
}
export default function DashboardFrame({ title, owner = false, fixture = false, children }) {
    const base = owner ? '/admin/creator-dashboard' : '/dashboard/creator';
    return <main className="cd-root">
        <header className="cd-header"><Link href={base} className="cd-brand">FIT <span>Creator workspace</span></Link><span>{owner ? 'Owner' : 'Creator'}</span></header>
        <div className="cd-layout"><nav className="cd-nav" aria-label="Creator workspace">
            <Link href={base}>Overview</Link><Link href={`${base}/orders`}>Orders</Link>
            {owner && <><Link href={`${base}/queue`}>Print queue</Link><Link href={`${base}/materials`}>Materials</Link></>}
            <Link href="/dashboard/creator/uploads">Uploads</Link>
            {!owner && <Link href="/dashboard/creator/jobs">Print status</Link>}
            <Link href={owner ? '/admin' : '/dashboard/products'}>{owner ? 'Shop admin' : 'My products'}</Link>
            <div className="cd-nav-note">One place for orders,<br />files and fulfilment.</div>
        </nav><section className="cd-content">
            {fixture && <p className="cd-notice">Demo workspace · sample data · changes are disabled</p>}
            <p className="cd-eyebrow">FIX IT TODAY / {owner ? 'WORKSHOP' : 'YOUR STORE'}</p><h1>{title}</h1>
            {children}
        </section></div>
    </main>;
}
