import mongoose from 'mongoose';

// _id is the durable cart intent. Mongo's built-in unique _id index is the
// arbitration point across tabs, processes and concurrent HTTP requests.
const schema = new mongoose.Schema({
    _id: String,
    userId: { type: String, required: true, immutable: true },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
    stripeParams: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
    sessionId: String,
}, { timestamps: true });

export default mongoose.models.CheckoutAttempt || mongoose.model('CheckoutAttempt', schema);
