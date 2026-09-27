#!/usr/bin/env node

import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config({ path: '.env.local' });

async function markDevCreator() {
    const { connectToDatabase } = await import('../lib/db.js');
    const User = (await import('../models/User.js')).default;

    const userId = 'user_36kairCBhA5WxgpxfMU5aK7Au5Q';

    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI is not set');
        process.exitCode = 1;
        return;
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

}

markDevCreator().finally(() => mongoose.disconnect()).catch((err) => {
    console.error('Error marking dev creator:', err);
    process.exitCode = 1;
});
