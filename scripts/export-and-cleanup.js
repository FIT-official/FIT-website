#!/usr/bin/env node

/**
 * Database Export and Cleanup Script
 * 
 * This script:
 * 1. Exports ALL products with their complete data to an Excel file
 * 2. Downloads all associated S3 assets (images, models, paid assets)
 * 3. Creates a zip file with everything
 * 4. Waits for user confirmation
 * 5. Deletes ALL database collections EXCEPT products
 * 
 * Usage:
 *   node scripts/export-and-cleanup.js
 */

import mongoose from 'mongoose';
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import archiver from 'archiver';
import ExcelJS from 'exceljs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Initialize S3 Client
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = process.env.NEXT_PUBLIC_S3_BUCKET_NAME;
const MONGODB_URI = process.env.MONGODB_URI;

// Output directories
const EXPORT_DIR = path.join(__dirname, '..', 'exports');
const ASSETS_DIR = path.join(EXPORT_DIR, 'assets');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
const EXPORT_NAME = `database-export-${TIMESTAMP}`;
const EXPORT_PATH = path.join(EXPORT_DIR, EXPORT_NAME);

// Models to import (we'll define schemas inline to avoid import issues)
const schemas = {};

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

// Initialize directory structure
function initializeDirectories() {
    [EXPORT_DIR, EXPORT_PATH, ASSETS_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
    console.log(`📁 Export directory: ${EXPORT_PATH}`);
}

// Connect to MongoDB
async function connectToDatabase() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
}

// Define all schemas
function defineSchemas() {
    // Product Schema
    schemas.Product = mongoose.models.Product || mongoose.model('Product', new mongoose.Schema({}, { strict: false }));
    schemas.User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    schemas.Order = mongoose.models.Order || mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
    schemas.CheckoutSession = mongoose.models.CheckoutSession || mongoose.model('CheckoutSession', new mongoose.Schema({}, { strict: false }));
    schemas.DigitalProductTransaction = mongoose.models.DigitalProductTransaction || mongoose.model('DigitalProductTransaction', new mongoose.Schema({}, { strict: false }));
    schemas.PrintOrder = mongoose.models.PrintOrder || mongoose.model('PrintOrder', new mongoose.Schema({}, { strict: false }));
    schemas.CustomPrintRequest = mongoose.models.CustomPrintRequest || mongoose.model('CustomPrintRequest', new mongoose.Schema({}, { strict: false }));
    schemas.Event = mongoose.models.Event || mongoose.model('Event', new mongoose.Schema({}, { strict: false }));
    schemas.BlogPost = mongoose.models.BlogPost || mongoose.model('BlogPost', new mongoose.Schema({}, { strict: false }));
    schemas.AppSettings = mongoose.models.AppSettings || mongoose.model('AppSettings', new mongoose.Schema({}, { strict: false }));
}

// Download file from S3
async function downloadFromS3(s3Key, localPath) {
    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
        });

        const response = await s3Client.send(command);
        const fileStream = fs.createWriteStream(localPath);

        return new Promise((resolve, reject) => {
            response.Body.pipe(fileStream);
            fileStream.on('finish', () => resolve(true));
            fileStream.on('error', reject);
        });
    } catch (error) {
        console.error(`⚠️  Failed to download ${s3Key}:`, error.message);
        return false;
    }
}

// Extract S3 keys from products
function extractS3Keys(products) {
    const s3Keys = new Set();

    products.forEach(product => {
        // Images
        if (product.images && Array.isArray(product.images)) {
            product.images.forEach(key => s3Keys.add(key));
        }

        // 3D Model
        if (product.viewableModel) {
            s3Keys.add(product.viewableModel);
        }

        // Paid Assets
        if (product.paidAssets && Array.isArray(product.paidAssets)) {
            product.paidAssets.forEach(key => s3Keys.add(key));
        }

        // Review Media
        if (product.reviews && Array.isArray(product.reviews)) {
            product.reviews.forEach(review => {
                if (review.mediaUrls && Array.isArray(review.mediaUrls)) {
                    review.mediaUrls.forEach(key => s3Keys.add(key));
                }
            });
        }
    });

    return Array.from(s3Keys).filter(key => key && key.trim() !== '');
}

// Download all assets
async function downloadAssets(s3Keys) {
    console.log(`\n📦 Downloading ${s3Keys.length} assets from S3...`);

    let downloaded = 0;
    let failed = 0;

    for (let i = 0; i < s3Keys.length; i++) {
        const key = s3Keys[i];
        const localPath = path.join(ASSETS_DIR, key.replace(/\//g, '_'));

        process.stdout.write(`\r⏳ Progress: ${i + 1}/${s3Keys.length} (${downloaded} successful, ${failed} failed)`);

        const success = await downloadFromS3(key, localPath);
        if (success) {
            downloaded++;
        } else {
            failed++;
        }
    }

    console.log(`\n✅ Downloaded ${downloaded} assets, ${failed} failed`);
    return { downloaded, failed };
}

// Create Excel export with all product data
async function createExcelExport(products) {
    console.log('\n📊 Creating Excel export...');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    // Define columns with all product fields
    worksheet.columns = [
        { header: 'ID', key: '_id', width: 25 },
        { header: 'Name', key: 'name', width: 30 },
        { header: 'Creator User ID', key: 'creatorUserId', width: 25 },
        { header: 'Slug', key: 'slug', width: 30 },
        { header: 'Description', key: 'description', width: 50 },
        { header: 'Product Type', key: 'productType', width: 15 },
        { header: 'Base Price (Amount)', key: 'basePrice_amount', width: 15 },
        { header: 'Base Price (Currency)', key: 'basePrice_currency', width: 15 },
        { header: 'Price Credits', key: 'priceCredits', width: 15 },
        { header: 'Stock', key: 'stock', width: 10 },
        { header: 'Category ID', key: 'categoryId', width: 20 },
        { header: 'Subcategory ID', key: 'subcategoryId', width: 20 },
        { header: 'Legacy Category', key: 'category', width: 15 },
        { header: 'Legacy Subcategory', key: 'subcategory', width: 15 },
        { header: 'Images', key: 'images', width: 50 },
        { header: 'Viewable Model', key: 'viewableModel', width: 50 },
        { header: 'Paid Assets', key: 'paidAssets', width: 50 },
        { header: 'Variant Types', key: 'variantTypes', width: 50 },
        { header: 'Delivery Types', key: 'deliveryTypes', width: 50 },
        { header: 'Dimensions (L×W×H)', key: 'dimensions', width: 20 },
        { header: 'Weight', key: 'weight', width: 10 },
        { header: 'Downloads', key: 'downloads', width: 10 },
        { header: 'Prints', key: 'prints', width: 10 },
        { header: 'Total Sales', key: 'totalSales', width: 10 },
        { header: 'Total Revenue', key: 'totalRevenue', width: 15 },
        { header: 'Average Rating', key: 'avgRating', width: 12 },
        { header: 'Review Count', key: 'reviewCount', width: 12 },
        { header: 'Likes Count', key: 'likesCount', width: 10 },
        { header: 'Hidden', key: 'hidden', width: 10 },
        { header: 'Flagged', key: 'flaggedForModeration', width: 10 },
        { header: 'Discount Percentage', key: 'discount_percentage', width: 15 },
        { header: 'Discount Start Date', key: 'discount_startDate', width: 20 },
        { header: 'Discount End Date', key: 'discount_endDate', width: 20 },
        { header: 'Discount Min Amount', key: 'discount_minAmount', width: 15 },
        { header: 'Created At', key: 'createdAt', width: 20 },
        { header: 'Updated At', key: 'updatedAt', width: 20 },
        { header: 'Schema Version', key: 'schemaVersion', width: 15 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF366092' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Add product data
    products.forEach(product => {
        // Calculate aggregates
        const totalSales = product.sales?.reduce((sum, sale) => sum + sale.quantity, 0) || 0;
        const totalRevenue = product.sales?.reduce((sum, sale) => sum + (sale.price * sale.quantity), 0) || 0;
        const avgRating = product.reviews?.length > 0
            ? (product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length).toFixed(2)
            : 0;

        worksheet.addRow({
            _id: product._id.toString(),
            name: product.name,
            creatorUserId: product.creatorUserId,
            slug: product.slug,
            description: product.description,
            productType: product.productType,
            basePrice_amount: product.basePrice?.presentmentAmount,
            basePrice_currency: product.basePrice?.presentmentCurrency,
            priceCredits: product.priceCredits,
            stock: product.stock,
            categoryId: product.categoryId,
            subcategoryId: product.subcategoryId,
            category: product.category,
            subcategory: product.subcategory,
            images: product.images?.join(', ') || '',
            viewableModel: product.viewableModel || '',
            paidAssets: product.paidAssets?.join(', ') || '',
            variantTypes: JSON.stringify(product.variantTypes || []),
            deliveryTypes: JSON.stringify(product.delivery?.deliveryTypes || []),
            dimensions: product.dimensions
                ? `${product.dimensions.length}×${product.dimensions.width}×${product.dimensions.height}`
                : '',
            weight: product.dimensions?.weight,
            downloads: product.downloads || 0,
            prints: product.prints || 0,
            totalSales,
            totalRevenue: totalRevenue.toFixed(2),
            avgRating,
            reviewCount: product.reviews?.length || 0,
            likesCount: product.likes?.length || 0,
            hidden: product.hidden || false,
            flaggedForModeration: product.flaggedForModeration || false,
            discount_percentage: product.discount?.percentage,
            discount_startDate: product.discount?.startDate,
            discount_endDate: product.discount?.endDate,
            discount_minAmount: product.discount?.minimumAmount,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt,
            schemaVersion: product.schemaVersion,
        });
    });

    // Create separate sheet for reviews
    const reviewSheet = workbook.addWorksheet('Reviews');
    reviewSheet.columns = [
        { header: 'Product ID', key: 'productId', width: 25 },
        { header: 'Product Name', key: 'productName', width: 30 },
        { header: 'Review ID', key: 'reviewId', width: 25 },
        { header: 'User ID', key: 'userId', width: 25 },
        { header: 'Username', key: 'username', width: 20 },
        { header: 'Rating', key: 'rating', width: 10 },
        { header: 'Comment', key: 'comment', width: 50 },
        { header: 'Verified Purchase', key: 'verifiedPurchase', width: 15 },
        { header: 'Purchased Variants', key: 'purchasedVariants', width: 30 },
        { header: 'Media URLs', key: 'mediaUrls', width: 50 },
        { header: 'Helpful Count', key: 'helpfulCount', width: 12 },
        { header: 'Created At', key: 'createdAt', width: 20 },
    ];

    reviewSheet.getRow(1).font = { bold: true };
    reviewSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF366092' }
    };
    reviewSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    products.forEach(product => {
        if (product.reviews && product.reviews.length > 0) {
            product.reviews.forEach(review => {
                reviewSheet.addRow({
                    productId: product._id.toString(),
                    productName: product.name,
                    reviewId: review._id?.toString() || '',
                    userId: review.userId,
                    username: review.username,
                    rating: review.rating,
                    comment: review.comment || '',
                    verifiedPurchase: review.verifiedPurchase || false,
                    purchasedVariants: review.purchasedVariants
                        ? JSON.stringify(Object.fromEntries(review.purchasedVariants))
                        : '',
                    mediaUrls: review.mediaUrls?.join(', ') || '',
                    helpfulCount: review.helpful?.length || 0,
                    createdAt: review.createdAt,
                });
            });
        }
    });

    // Create sales sheet
    const salesSheet = workbook.addWorksheet('Sales');
    salesSheet.columns = [
        { header: 'Product ID', key: 'productId', width: 25 },
        { header: 'Product Name', key: 'productName', width: 30 },
        { header: 'Sale ID', key: 'saleId', width: 25 },
        { header: 'User ID', key: 'userId', width: 25 },
        { header: 'Quantity', key: 'quantity', width: 10 },
        { header: 'Price', key: 'price', width: 15 },
        { header: 'Total', key: 'total', width: 15 },
        { header: 'Created At', key: 'createdAt', width: 20 },
    ];

    salesSheet.getRow(1).font = { bold: true };
    salesSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF366092' }
    };
    salesSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    products.forEach(product => {
        if (product.sales && product.sales.length > 0) {
            product.sales.forEach(sale => {
                salesSheet.addRow({
                    productId: product._id.toString(),
                    productName: product.name,
                    saleId: sale._id?.toString() || '',
                    userId: sale.userId,
                    quantity: sale.quantity,
                    price: sale.price,
                    total: (sale.price * sale.quantity).toFixed(2),
                    createdAt: sale.createdAt,
                });
            });
        }
    });

    // Save workbook
    const excelPath = path.join(EXPORT_PATH, `products-complete-${TIMESTAMP}.xlsx`);
    await workbook.xlsx.writeFile(excelPath);
    console.log(`✅ Excel file created: ${excelPath}`);

    return excelPath;
}

// Create zip file
async function createZipFile() {
    console.log('\n📦 Creating zip archive...');

    const zipPath = path.join(EXPORT_DIR, `${EXPORT_NAME}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
        output.on('close', () => {
            const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
            console.log(`✅ Zip created: ${zipPath} (${sizeMB} MB)`);
            resolve(zipPath);
        });

        archive.on('error', reject);
        archive.pipe(output);

        // Add all files from export directory
        archive.directory(EXPORT_PATH, false);
        archive.finalize();
    });
}

// Export all data
async function exportAllData() {
    console.log('\n🚀 Starting export process...\n');

    // Get all products
    console.log('📦 Fetching all products...');
    const products = await schemas.Product.find({}).lean();
    console.log(`✅ Found ${products.length} products`);

    // Create Excel export
    await createExcelExport(products);

    // Extract and download S3 assets
    const s3Keys = extractS3Keys(products);
    console.log(`\n📋 Found ${s3Keys.length} unique S3 assets`);

    if (s3Keys.length > 0) {
        await downloadAssets(s3Keys);
    }

    // Create asset mapping file
    const mappingPath = path.join(EXPORT_PATH, 'asset-mapping.json');
    const mapping = {};
    products.forEach(product => {
        mapping[product._id.toString()] = {
            name: product.name,
            images: product.images || [],
            viewableModel: product.viewableModel || null,
            paidAssets: product.paidAssets || [],
        };
    });
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
    console.log(`✅ Asset mapping saved: ${mappingPath}`);

    // Create metadata file
    const metadataPath = path.join(EXPORT_PATH, 'export-metadata.json');
    const metadata = {
        exportDate: new Date().toISOString(),
        productsCount: products.length,
        assetsCount: s3Keys.length,
        database: MONGODB_URI.split('@')[1], // Don't expose credentials
        bucket: BUCKET_NAME,
    };
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`✅ Metadata saved: ${metadataPath}`);

    // Create zip
    const zipPath = await createZipFile();

    console.log('\n✅ Export complete!');
    console.log(`📁 Export location: ${EXPORT_PATH}`);
    console.log(`📦 Zip file: ${zipPath}`);

    return { products, zipPath };
}

// Get all collections in database
async function getAllCollections() {
    const collections = await mongoose.connection.db.listCollections().toArray();
    return collections.map(col => col.name);
}

// Delete all collections except products
async function deleteAllExceptProducts() {
    console.log('\n🗑️  Starting deletion process...\n');

    const collections = await getAllCollections();
    console.log(`Found ${collections.length} collections in database\n`);

    const collectionsToDelete = collections.filter(name => name !== 'products');
    const collectionsToKeep = collections.filter(name => name === 'products');

    console.log('📋 Collections to DELETE:');
    collectionsToDelete.forEach(name => console.log(`   ❌ ${name}`));

    console.log('\n📋 Collections to KEEP:');
    collectionsToKeep.forEach(name => console.log(`   ✅ ${name}`));

    console.log('\n⚠️  WARNING: This action is IRREVERSIBLE!');
    console.log('⚠️  All data except products will be permanently deleted.\n');

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
    console.log(`✅ Products collection preserved with all data intact.\n`);

    return true;
}

// Main execution
async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     DATABASE EXPORT AND CLEANUP TOOL                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    try {
        // Initialize
        initializeDirectories();
        await connectToDatabase();
        defineSchemas();

        // Export phase
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('  PHASE 1: EXPORT ALL PRODUCTS AND ASSETS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const { products, zipPath } = await exportAllData();

        // Cleanup phase
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('  PHASE 2: DATABASE CLEANUP');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        console.log('\n✅ Export complete! Your data is safely backed up.');
        console.log(`📦 Backup location: ${zipPath}\n`);

        const proceed = await question('Do you want to proceed with database cleanup? (yes/no): ');

        if (proceed.toLowerCase() === 'yes' || proceed.toLowerCase() === 'y') {
            await deleteAllExceptProducts();
        } else {
            console.log('\n✅ Cleanup skipped. Your data has been exported and is ready to use.');
        }

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║                    PROCESS COMPLETE                        ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exit(1);
    } finally {
        rl.close();
        await mongoose.disconnect();
        console.log('👋 Disconnected from database. Goodbye!\n');
    }
}

// Run the script
main();
