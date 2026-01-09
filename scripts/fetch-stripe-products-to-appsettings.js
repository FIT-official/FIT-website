#!/usr/bin/env node
// Fetches all Stripe products and their active monthly prices, then updates AppSettings.stripePriceTiers in MongoDB
// Usage: node scripts/fetch-stripe-products-to-appsettings.js
// Requires STRIPE_API_KEY and MONGODB_URI in env

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

import Stripe from 'stripe';
import mongoose from 'mongoose';
import AppSettings from '../models/AppSettings.js';

const STRIPE_API_KEY = process.env.STRIPE_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL;
if (!STRIPE_API_KEY) {
  console.error('Missing STRIPE_API_KEY in environment.');
  process.exit(1);
}
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI or MONGO_URL in environment.');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_API_KEY, { apiVersion: '2023-10-16' });

// Map product names to tier keys
const tierNameMap = {
  'Professional': 'tier1',
  'Advanced': 'tier2',
  'Basic': 'tier3',
  'Hobbyist': 'tier4',
};

async function main() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  // Fetch all products
  const products = await stripe.products.list({ limit: 100, active: true });
  const priceIdMap = {};

  for (const prod of products.data) {
    const tierKey = tierNameMap[prod.name];
    if (!tierKey) continue;
    // Find the active monthly price in SGD
    const prices = await stripe.prices.list({ product: prod.id, active: true, limit: 10 });
    const price = prices.data.find(p => p.currency === 'sgd' && p.recurring && p.recurring.interval === 'month');
    if (price) {
      priceIdMap[tierKey] = price.id;
      console.log(`Mapped ${prod.name} to ${tierKey}: ${price.id}`);
    } else {
      console.warn(`No active monthly SGD price found for product: ${prod.name}`);
    }
  }

  if (Object.keys(priceIdMap).length === 0) {
    console.error('No Stripe price IDs found for any tier. Aborting.');
    process.exit(1);
  }

  // Update AppSettings in MongoDB
  const appSettingsId = process.env.NODE_ENV === 'development' ? 'app-settings-dev' : 'app-settings';
  await AppSettings.findOneAndUpdate(
    { _id: appSettingsId },
    { $set: { stripePriceTiers: priceIdMap } },
    { upsert: true, new: true }
  );
  console.log('AppSettings updated with Stripe price IDs:', priceIdMap);

  await mongoose.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
