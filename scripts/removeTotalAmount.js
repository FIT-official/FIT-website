const mongoose = require('mongoose');
require('dotenv').config();

async function removeTotalAmount() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const result = await mongoose.connection.db.collection('customprintrequests').updateMany(
            {},
            { $unset: { totalAmount: 1 } }
        );

        console.log(`Removed totalAmount from ${result.modifiedCount} documents`);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

removeTotalAmount();