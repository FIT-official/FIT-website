import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { authenticate, unauthorizedResponse } from '@/lib/authenticate';
import { checkAdminPrivileges } from '@/lib/checkPrivileges';
import Product from '@/models/Product';
import { clerkClient } from '@clerk/nextjs/server';
import { sendEmail } from '@/lib/email';
import { buildDeliveryTypeChangedEmail } from '@/lib/email/templates/transactional';

export async function POST(request) {
    let userId;
    try {
        ({ userId } = await authenticate(request));
    } catch {
        return unauthorizedResponse();
    }

    if (!(await checkAdminPrivileges(userId))) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { deliveryTypeName, changes } = await request.json();
    await connectToDatabase();

    // Find all products that use this delivery type
    const products = await Product.find({
        'delivery.deliveryTypes.type': deliveryTypeName
    }).select('creatorUserId name');

    // Deduplicate creator IDs
    const creatorIds = [...new Set(products.map(p => p.creatorUserId).filter(Boolean))];

    let notifiedCount = 0;
    const clerk = await clerkClient();
    for (const creatorId of creatorIds) {
        try {
            const user = await clerk.users.getUser(creatorId);
            const email = user?.emailAddresses?.[0]?.emailAddress;
            if (!email) continue;

            const { subject, html } = buildDeliveryTypeChangedEmail({
                deliveryTypeName,
                displayName: changes?.displayName,
            });
            await sendEmail({ to: email, subject, html });
            notifiedCount++;
        } catch (err) {
            console.error(`Failed to notify creator ${creatorId}:`, err);
        }
    }

    return NextResponse.json({ notified: notifiedCount });
}
