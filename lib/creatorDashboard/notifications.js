import { sendEmail } from '@/lib/email';
import { esc } from '@/lib/email/template';

// Preview delivery is restricted to the approved mailbox. Never print customer PII.
export async function notifyOrderStatus(order, status) {
    const allowed = 'fixittoday.contact@gmail.com';
    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASSWORD ||
        (process.env.ADMIN_EMAIL || process.env.GMAIL_USER) !== allowed || order?.customerEmail !== allowed) {
        console.info('Creator order status notification: log-only');
        return { delivered: false };
    }
    const link = /^[a-f0-9]{32}$/.test(order.trackingToken || '') && /^https:\/\//.test(process.env.NEXT_PUBLIC_BASE_URL || '') ? `${process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')}/track/${order.trackingToken}` : '';
    await sendEmail({ to: order.customerEmail, subject: 'Your FIT order status',
        text: `Your order is now ${status.replaceAll('_', ' ')}.${link ? ` Track it: ${link}` : ''}`,
        html: `<p>Your order is now ${esc(status.replaceAll('_', ' '))}.</p>${link ? `<p><a href="${esc(link)}">Track your order</a></p>` : ''}` });
    return { delivered: true };
}
