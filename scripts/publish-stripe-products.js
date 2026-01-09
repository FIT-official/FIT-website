#!/usr/bin/env node
// Publishes 4 products to Stripe and fetches their price IDs for setup (dev only)
// Usage: node scripts/publish-stripe-products.js
// Requires STRIPE_API_KEY in .env.local

// Load env from scripts/.env.tunnel if present, else fallback to default

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
  dotenv.config(); // fallback to default (e.g. .env, .env.local)
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
  process.exit(1);s
}

const stripe = new Stripe(STRIPE_API_KEY, { apiVersion: '2023-10-16' });

const products = [
  {
    name: 'Professional',
    description: 'For seasoned creators',
    features: ['Professional Feature 1', 'Professional Feature 2', 'Professional Feature 3'],
    price: 24,
  },
  {
    name: 'Advanced',
    description: 'For creators.',
    features: ['Advanced Feature 1', 'Advanced  Feature 2', 'Advanced Feature 3'],
    price: 12,
  },
  {
    name: 'Basic',
    description: 'For newbies.',
    features: ['Basic Feature 1', 'Basic Feature 2', 'Basic  Feature 3'],
    price: 6,
  },
  {
    name: 'Hobbyist',
    description: 'For ultra mega newbies.',
    features: ['Hobbyist Feature 1', 'Hobbyist Feature 2', 'Hobbyist Feature 3'],
    price: 3,
  },
];

async function main() {
  // Connect to MongoDB
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  const created = [];
  for (const prod of products) {
    // Check if product already exists in Stripe (by name)
    const existing = await stripe.products.list({ limit: 100, active: true });
    let product = existing.data.find(p => p.name === prod.name);
    if (!product) {
      product = await stripe.products.create({
        name: prod.name,
        description: prod.description,
        metadata: { features: JSON.stringify(prod.features) },
      });
      console.log(`Created product: ${prod.name}`);
    } else {
      console.log(`Product already exists: ${prod.name}`);
    }
    // Check if price exists for this product
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
    let price = prices.data.find(p => p.unit_amount === prod.price * 100 && p.currency === 'sgd');
    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: prod.price * 100,
        currency: 'sgd',
        recurring: { interval: 'month' },
      });
      console.log(`Created price for ${prod.name}: SGD ${prod.price}`);
    } else {
      console.log(`Price already exists for ${prod.name}: SGD ${prod.price}`);
    }
    created.push({ name: prod.name, productId: product.id, priceId: price.id });
  }

  // Update AppSettings in MongoDB
  const priceIdMap = {
    tier1: created.find(p => p.name === 'Professional')?.priceId,
    tier2: created.find(p => p.name === 'Advanced')?.priceId,
    tier3: created.find(p => p.name === 'Basic')?.priceId,
    tier4: created.find(p => p.name === 'Hobbyist')?.priceId,
  };
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
