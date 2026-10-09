import { sendEmail } from '@/lib/email';

// Preview delivery is restricted to the approved mailbox. Never print customer PII.
export async function notifyOrderStatus(order, status) {
    const allowed = 'fixittoday.contact@gmail.com';
    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASSWORD ||
        (process.env.ADMIN_EMAIL || process.env.GMAIL_USER) !== allowed || order?.customerEmail !== allowed) {
        console.info('Creator order status notification: log-only');
        return { delivered: false };
    }
    await sendEmail({ to: order.customerEmail, subject: 'Your FIT order status',
        text: `Your order is now ${status.replaceAll('_', ' ')}.`,
        html: `<p>Your order is now ${status.replaceAll('_', ' ')}.</p>` });
    return { delivered: true };
}
