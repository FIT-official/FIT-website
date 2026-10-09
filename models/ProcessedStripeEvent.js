import mongoose from 'mongoose';
const schema = new mongoose.Schema({
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true }, processedAt: { type: Date, default: Date.now },
}, { autoCreate: false, autoIndex: false });
export default mongoose.models.ProcessedStripeEvent || mongoose.model('ProcessedStripeEvent', schema);
