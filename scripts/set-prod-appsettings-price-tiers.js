#!/usr/bin/env node
// Sets the production AppSettings doc's stripePriceTiers to the hardcoded PROD_PRICE_IDS from stripeConfig.js
// Usage: node scripts/set-prod-appsettings-price-tiers.js
// Requires MONGODB_URI in env

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tunnelEnvPath = path.resolve(__dirname, './.env.tunnel');
if (fs.existsSync(tunnelEnvPath)) {
  dotenv.config({ path: tunnelEnvPath });
  console.log('Loaded environment from scripts/.env.tunnel');
} else {
  dotenv.config();
}

import mongoose from 'mongoose';
import AppSettings from '../models/AppSettings.js';

// Copy the hardcoded prod price IDs from stripeConfig.js
const PROD_PRICE_IDS = {
    tier1: 'price_1RoLEqL8rcZaPQbIbEJFpb8w',
    tier2: 'price_1RoLFaL8rcZaPQbIkidotx2y',
    tier3: 'price_1RoLGsL8rcZaPQbIMgKmvF5q',
    tier4: 'price_1RoLJEL8rcZaPQbIhoVl8diR',
};

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL;
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI or MONGO_URL in environment.');
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  await AppSettings.findOneAndUpdate(
    { _id: 'app-settings' },
    { $set: { env: 'production', stripePriceTiers: PROD_PRICE_IDS } },
    { upsert: true, new: true }
  );
  console.log('Production AppSettings updated with hardcoded PROD_PRICE_IDS:', PROD_PRICE_IDS);

  await mongoose.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
