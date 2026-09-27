#!/usr/bin/env node

/**
 * Complete Database and S3 Cleanup Script
 * 
 * This script deletes:
 * - ALL database collections EXCEPT appsettings
 * - ALL files from S3 bucket
 * 
 * Usage:
 *   node scripts/delete-collections.js
 */

import mongoose from 'mongoose';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import readline from 'readline';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const MONGODB_URI = process.env.MONGODB_URI;
const BUCKET_NAME = process.env.NEXT_PUBLIC_S3_BUCKET_NAME;

// Initialize S3 Client
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

// Connect to MongoDB
async function connectToDatabase() {
    try {
        await mongoose.connect(MONGODB_URI, { maxPoolSize: 5, minPoolSize: 0, maxIdleTimeMS: 60000 });
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        throw error;
    }
}

// Get all collections in database
async function getAllCollections() {
    const collections = await mongoose.connection.db.listCollections().toArray();
    return collections.map(col => col.name);
}

// Delete all files from S3 bucket
async function deleteAllS3Files() {
    console.log('\n🗑️  Starting S3 cleanup...\n');

    try {
        let continuationToken = undefined;
        let totalDeleted = 0;

        do {
            // List objects in bucket
            const listCommand = new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                ContinuationToken: continuationToken,
                MaxKeys: 1000
            });

            const listResponse = await s3Client.send(listCommand);

            if (!listResponse.Contents || listResponse.Contents.length === 0) {
                console.log('📦 No objects found in S3 bucket');
                break;
            }

            console.log(`📦 Found ${listResponse.Contents.length} objects to delete...`);

            // Delete objects in batches of 1000 (S3 limit)
            const objectsToDelete = listResponse.Contents.map(obj => ({ Key: obj.Key }));

            const deleteCommand = new DeleteObjectsCommand({
                Bucket: BUCKET_NAME,
                Delete: {
                    Objects: objectsToDelete,
                    Quiet: false
                }
            });

            const deleteResponse = await s3Client.send(deleteCommand);

            const deletedCount = deleteResponse.Deleted?.length || 0;
            totalDeleted += deletedCount;

            console.log(`   ✅ Deleted ${deletedCount} objects`);

            if (deleteResponse.Errors && deleteResponse.Errors.length > 0) {
                console.log(`   ⚠️  Failed to delete ${deleteResponse.Errors.length} objects`);
                deleteResponse.Errors.forEach(error => {
                    console.log(`      ❌ ${error.Key}: ${error.Message}`);
                });
            }

            continuationToken = listResponse.NextContinuationToken;

        } while (continuationToken);

        console.log(`\n✅ S3 cleanup complete! Total objects deleted: ${totalDeleted}\n`);
        return true;

    } catch (error) {
        console.error('❌ S3 cleanup error:', error.message);
        return false;
    }
}

// Delete all collections except appsettings
async function deleteCollections() {
    console.log('\n🗑️  Starting deletion process...\n');

    const collections = await getAllCollections();
    console.log(`Found ${collections.length} collections in database\n`);

    // Keep only appsettings
    const collectionsToDelete = collections.filter(name => name !== 'appsettings');
    const collectionsToKeep = collections.filter(name => name === 'appsettings');

    console.log('📋 Collections to DELETE:');
    collectionsToDelete.forEach(name => console.log(`   ❌ ${name}`));

    console.log('\n📋 Collections to KEEP:');
    collectionsToKeep.forEach(name => console.log(`   ✅ ${name}`));

    console.log('\n⚠️  WARNING: This action is IRREVERSIBLE!');
    console.log('⚠️  All data except appsettings will be permanently deleted.\n');

    const answer = await question('Type "DELETE EVERYTHING" to confirm deletion: ');

    if (answer.trim() !== 'DELETE EVERYTHING') {
        console.log('\n❌ Deletion cancelled. No data was deleted.');
        return false;
    }

    console.log('\n🗑️  Deleting collections...\n');

    let deleted = 0;
    for (const collectionName of collectionsToDelete) {
        try {
            await mongoose.connection.db.dropCollection(collectionName);
            console.log(`   ✅ Deleted: ${collectionName}`);
            deleted++;
        } catch (error) {
            console.error(`   ❌ Failed to delete ${collectionName}:`, error.message);
        }
    }

    console.log(`\n✅ Deletion complete! ${deleted} collections deleted.`);
    console.log(`✅ AppSettings collection preserved with all data intact.\n`);

    return true;
}

// Main execution
async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║    COMPLETE DATABASE AND S3 CLEANUP TOOL                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    try {
        await connectToDatabase();

        // Delete MongoDB collections
        await deleteCollections();

        // Ask about S3 cleanup
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('  S3 BUCKET CLEANUP');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        const s3Answer = await question('Do you want to delete ALL files from S3 bucket? (yes/no): ');

        if (s3Answer.toLowerCase() === 'yes' || s3Answer.toLowerCase() === 'y') {
            await deleteAllS3Files();
        } else {
            console.log('\n⏭️  S3 cleanup skipped.\n');
        }

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║                    PROCESS COMPLETE                        ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exitCode = 1;
    } finally {
        rl.close();
        await mongoose.disconnect();
        console.log('👋 Disconnected from database. Goodbye!\n');
    }
}

// Run the script
main().catch(error => {
    console.error('MongoDB cleanup failed:', error);
    process.exitCode = 1;
});
