import nodemailer from 'nodemailer';

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

export async function sendEmail({ to, subject, html, text, messageId }) {
    const t = getTransporter();
    return await t.sendMail({
        from: `"FixItToday" <${GMAIL_USER}>`,
        to,
        subject,
        html,
        ...(text ? { text } : {}),
        ...(messageId ? { messageId } : {}),
    });
}

export function wrapInTemplate(bodyHtml) {
    return `
<div style="background-color: #000; color: #fff; font-family: Inter, sans-serif; font-size: 15px; max-width: 600px; margin: auto; padding: 32px;">
  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
    <img src="https://www.fixitoday.com/logo-mark.svg" alt="FIT Logo" style="width: 32px; height: 32px;" />
    <h2 style="font-size: 24px; font-weight: medium; margin: 0;">Fix It Today</h2>
  </div>
  <hr style="border: none; border-top: 1px solid #333; margin: 18px 0;" />
  ${bodyHtml}
  <p style="margin-top: 32px;">
    Best regards,<br />
    The <b style="color: #ffdd00;">Fix It Today</b> Team<br />
    <a href="https://www.fixitoday.com" style="color: #ffdd00; text-decoration: none;">www.fixitoday.com</a><br />
    <a href="mailto:fixittoday.contact@gmail.com" style="color: #ffdd00; text-decoration: none;">fixittoday.contact@gmail.com</a>
  </p>
  <div style="margin-top: 32px; text-align: center;">
    <img src="https://www.fixitoday.com/logo-mark.svg" alt="FIT Logo" style="width: 60px; height: 60px;" />
  </div>
</div>`;
}
