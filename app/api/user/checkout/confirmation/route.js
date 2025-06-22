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
            subject: "FIT Order Confirmation",
            html: `<h2>Thank you for your order!</h2>
                   <p>Your order has been received and is being processed.</p>`,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error sending confirmation email:", error);
        return NextResponse.json({ error: "Failed to send confirmation email" }, { status: 500 });
    }
}