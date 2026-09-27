// Usage: node scripts/fixCustomPrintRequests.js
// Loads .env/.env.tunnel and uses connectToDatabase from lib/db.js

require('dotenv').config({ path: require('path').resolve(__dirname, '.env.tunnel') });
const mongoose = require('mongoose');
const { connectToDatabase } = require('../lib/db.js');

async function main() {
  const conn = await connectToDatabase();
  const collection = conn.connection.collection('customprintrequests');

  const result = await collection.updateMany(
    {},
    [
      {
        $set: {
          delivery: { $ifNull: ['$delivery', { deliveryTypes: [] }] },
          dimensions: { $ifNull: ['$dimensions', { length: null, width: null, height: null, weight: null }] },
          notes: { $ifNull: ['$notes', ''] }
        }
      },
      { $unset: ['deliveryFee', 'deliveryType', 'totalAmount'] }
    ]
  );

  console.log(`Updated ${result.modifiedCount} documents.`);
}

main().finally(() => mongoose.disconnect()).catch(err => {
  console.error(err);
  process.exitCode = 1;
});
