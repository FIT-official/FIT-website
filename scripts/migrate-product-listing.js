#!/usr/bin/env node
// Backfill Product.listing for products created before the field existed.
//
// Rule: a product with no `listing` becomes 'fit' when its creatorUserId is
// one of the Fix It Today admin accounts, otherwise 'creator'. Products that
// already carry a listing are left alone, so the script is safe to re-run.
//
// Usage (from the repo root, .env.local provides MONGODB_URI):
//   ADMIN_USER_IDS=user_abc,user_def node scripts/migrate-product-listing.js
//   ADMIN_USER_IDS=user_abc node scripts/migrate-product-listing.js --dry-run
//
// ADMIN_USER_IDS is a comma-separated list of Clerk user ids. It may also be
// set in .env.local. With --dry-run nothing is written; counts are printed.

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment from .env.local so MONGODB_URI is available like in Next.js
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const dryRun = process.argv.includes("--dry-run");

async function run() {
    const adminIds = String(process.env.ADMIN_USER_IDS || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

    if (adminIds.length === 0) {
        console.warn("ADMIN_USER_IDS is empty: every unlabelled product will become listing='creator'.");
    } else {
        console.log(`Admin ids (-> 'fit'): ${adminIds.join(", ")}`);
    }

    console.log("Connecting to database...");
    // Import DB and model only after env vars are loaded
    const { connectToDatabase } = await import("../lib/db.js");
    const { default: Product } = await import("../models/Product.js");
    await connectToDatabase();

    const missing = { listing: { $exists: false } };
    const total = await Product.countDocuments(missing);
    console.log(`Products without a listing: ${total}`);

    const fitFilter = { ...missing, creatorUserId: { $in: adminIds } };
    const creatorFilter = { ...missing, creatorUserId: { $nin: adminIds } };
    const fitCount = adminIds.length ? await Product.countDocuments(fitFilter) : 0;
    const creatorCount = await Product.countDocuments(creatorFilter);
    console.log(`  -> 'fit': ${fitCount}`);
    console.log(`  -> 'creator': ${creatorCount}`);

    if (dryRun) {
        console.log("Dry run: nothing written.");
        process.exit(0);
    }

    if (adminIds.length) {
        const res = await Product.updateMany(fitFilter, { $set: { listing: "fit" } });
        console.log(`Set listing='fit' on ${res.modifiedCount} products.`);
    }
    const res2 = await Product.updateMany(creatorFilter, { $set: { listing: "creator" } });
    console.log(`Set listing='creator' on ${res2.modifiedCount} products.`);

    console.log("Done.");
    process.exit(0);
}

run().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
