import nodemailer from 'nodemailer';
import { emailLayout, emailPlainText } from '@/lib/email/template';

const { GMAIL_PASSWORD, GMAIL_USER } = process.env;

let transporter = null;

function getTransporter() {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: GMAIL_USER, pass: GMAIL_PASSWORD },
        });
    }
    return transporter;
}

export async function sendEmail({ to, subject, html, text, messageId, attachments }) {
    const t = getTransporter();
    return await t.sendMail({
        from: `"FixItToday" <${GMAIL_USER}>`,
        to,
        subject,
        html,
        ...(attachments ? { attachments } : {}),
        text: text || emailPlainText(html),
        ...(messageId ? { messageId } : {}),
    });
}

export function wrapInTemplate(bodyHtml) {
    return emailLayout({ bodyHtml });
}
