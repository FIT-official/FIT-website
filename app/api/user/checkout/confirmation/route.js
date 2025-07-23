import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

const {
    GMAIL_PASSWORD,
    GMAIL_USER
} = process.env;

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: GMAIL_USER,
        pass: GMAIL_PASSWORD,
    },
});

export async function POST(req) {
    try {
        const { email } = await req.json();
        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        await transporter.sendMail({
            from: `"FixItToday" <${GMAIL_USER}>`,
            to: email,
            subject: "Fix It Today (FIT) Order Confirmation – Thank You for Your Purchase!",
            html: `
                <div style="background-color: #000; color: #fff; font-family: Inter, sans-serif; font-size: 15px; max-width: 600px; margin: auto; padding: 32px;">
  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
    <img src="https://www.fixitoday.com/logo-mark.svg" alt="FIT Logo" style="width: 32px; height: 32px;" />
    <h2 style="font-size: 24px; font-weight: medium; margin: 0;">
      FIT Order Confirmation
    </h2>
  </div>
  <hr style="border: none; border-top: 1px solid #333; margin: 18px 0;" />

  <p style="margin: 0 0 16px 0;">Dear Customer,</p>

  <p style="margin: 0 0 16px 0;">
    Thank you for your recent purchase with <b style="color: #ffdd00;">Fix It Today</b>! Your order has been successfully received and is now being processed.
  </p>

  <h3 style="font-size: 16px; margin: 24px 0 8px 0; color: #ffdd00;">What Happens Next:</h3>
  <ol style="margin-left: 20px; padding-left: 0; color: #ddd;">
    <li style="margin-bottom: 8px;">
      <b style="color: #ffdd00;">Order Processing:</b> We are preparing your order. Check status in your account under "Orders".
    </li>
    <li>
      <b style="color: #ffdd00;">Delivery:</b> Your order will be shipped to the address you provided. Delivery time may vary by location.
    </li>
  </ol>

  <p style="margin: 16px 0;">
    If you have any questions, contact us at
    <a href="mailto:fixittoday.contact@gmail.com" style="color: #ffdd00; text-decoration: none;">fixittoday.contact@gmail.com</a>.
  </p>

  <p style="margin: 16px 0;">
    Thank you for choosing FIT!
  </p>

  <p style="margin-top: 32px;">
    Best regards,<br />
    The <b style="color: #ffdd00;">Fix It Today</b> Team<br />
    <a href="https://www.fixitoday.com" style="color: #ffdd00; text-decoration: none;">www.fixitoday.com</a><br />
    <a href="mailto:fixittoday.contact@gmail.com" style="color: #ffdd00; text-decoration: none;">fixittoday.contact@gmail.com</a>
  </p>

  <div style="margin-top: 32px; text-align: center;">
    <img src="https://www.fixitoday.com/logo-mark.svg" alt="FIT Logo" style="width: 60px; height: 60px;" />
  </div>
</div>

            `,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error sending confirmation email:", error);
        return NextResponse.json({ error: "Failed to send confirmation email" }, { status: 500 });
    }
}