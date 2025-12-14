#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function markDevCreator() {
    const { connectToDatabase } = await import('../lib/db.js');
    const User = (await import('../models/User.js')).default;

    const userId = 'user_36kairCBhA5WxgpxfMU5aK7Au5Q';

    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI is not set');
        process.exit(1);
    }

    await connectToDatabase();

    const updated = await User.findOneAndUpdate(
        { userId },
        {
            $set: {
                'metadata.role': 'Creator',
                'metadata.displayName': userId,
            },
            $setOnInsert: { userId },
        },
        { upsert: true, new: true }
    );

    console.log('Marked user as creator:', {
        userId: updated.userId,
        role: updated.metadata?.role,
        displayName: updated.metadata?.displayName,
        creatorProductsCount: Array.isArray(updated.creatorProducts) ? updated.creatorProducts.length : 0,
    });

    process.exit(0);
}

markDevCreator().catch((err) => {
    console.error('Error marking dev creator:', err);
    process.exit(1);
});
