#!/usr/bin/env node
// Creates/updates two AppSettings docs: one for production, one for development, with a new 'env' field
// Usage: node scripts/sync-appsettings-env.js
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

async function fetchStripePriceTiers() {
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
  return priceIdMap;
}

async function main() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  // Load the current app-settings doc for base fields
  const prodDoc = await AppSettings.findOne({ _id: 'app-settings' }).lean(); // Always fetch prod doc for base
  if (!prodDoc) {
    console.error('No base app-settings document found. Please create one manually first.');
    process.exit(1);
  }

  // 1. Update production version (env: 'production')
  await AppSettings.findOneAndUpdate(
    { _id: 'app-settings' },
    { $set: { env: 'production', stripePriceTiers: tierNameMap } },
    { upsert: true, new: true }
  );
  console.log('Production AppSettings updated (env: production, prod price ids expected).');

  // 2. Create/update dev version (env: 'development')
  const devPriceTiers = await fetchStripePriceTiers();
  const devDoc = { ...prodDoc, _id: 'app-settings-dev', env: 'development', stripePriceTiers: devPriceTiers };
  // Remove MongoDB internal fields
  delete devDoc.__v;
  delete devDoc.createdAt;
  delete devDoc.updatedAt;
  // Upsert dev doc
  await AppSettings.findOneAndUpdate(
    { _id: 'app-settings-dev' },
    { $set: devDoc },
    { upsert: true, new: true }
  );
  console.log('Development AppSettings updated (env: development, dev price ids set).');

  await mongoose.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
