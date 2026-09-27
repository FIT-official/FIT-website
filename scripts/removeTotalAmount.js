const mongoose = require('mongoose');
require('dotenv').config();

async function removeTotalAmount() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, { maxPoolSize: 5, minPoolSize: 0, maxIdleTimeMS: 60000 });
        console.log('Connected to MongoDB');

        const result = await mongoose.connection.db.collection('customprintrequests').updateMany(
            {},
            { $unset: { totalAmount: 1 } }
        );

        console.log(`Removed totalAmount from ${result.modifiedCount} documents`);
    } catch (error) {
        console.error('Error:', error);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

removeTotalAmount().catch(error => {
    console.error('MongoDB cleanup failed:', error);
    process.exitCode = 1;
});
