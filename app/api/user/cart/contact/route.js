import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/db';
import { cartIdentity, cartOwner } from '@/lib/cartOwner';

const text = z.string().trim().min(1).max(200);
const contactSchema = z.object({
    name: text.max(100), email: z.string().trim().email().max(254),
    address: z.object({ street: text, city: text, state: text, postalCode: text.max(20),
        country: z.string().regex(/^[A-Z]{2}$/), unitNumber: z.string().trim().max(100).default('') }),
});

export async function PUT(req) {
    try {
        const identity = await cartIdentity(req);
        if (!identity.guest || !identity.userId) return NextResponse.json({ error: 'Open your guest cart before continuing.' }, { status: 401 });
        const parsed = contactSchema.safeParse(await req.json());
        if (!parsed.success) return NextResponse.json({ error: 'Enter your name, email and complete delivery address.' }, { status: 400 });
        await connectToDatabase();
        const user = await cartOwner(identity);
        if (!user) return NextResponse.json({ error: 'Your cart has expired. Please return to the shop.' }, { status: 401 });
        const { name, email, address } = parsed.data;
        user.guestContact = { name, email, address };
        await user.save();
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Unable to save your details. Please try again.' }, { status: 503 });
    }
}
