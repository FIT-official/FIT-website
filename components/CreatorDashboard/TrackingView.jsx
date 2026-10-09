'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardFrame, { StatusBadge } from './DashboardFrame';
export default function TrackingView({ orders, fixture = false }) {
    const router = useRouter();
    useEffect(() => { if (fixture) return; const timer = setInterval(() => router.refresh(), 4000); return () => clearInterval(timer); }, [fixture, router]);
    return <DashboardFrame title="Your order" fixture={fixture}>
        <p className="cd-muted">Follow your items through the workshop. Keep this private link safe.</p>
        {orders.map((order, i) => <section className="cd-card" key={i}><StatusBadge status={order.status} /><h2 style={{ marginTop: 18 }}>{order.items.map(item => `${item.name} × ${item.qty}`).join(', ')}</h2>
            <ol className="cd-timeline">{order.statusHistory.map((entry, n) => <li key={n}>{entry.status.replaceAll('_', ' ')}<time>{new Date(entry.at).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}</time></li>)}</ol>
        </section>)}
    </DashboardFrame>;
}
