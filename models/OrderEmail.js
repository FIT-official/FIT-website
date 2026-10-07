import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    _id: { type: String },
    to: { type: String, required: true },
    subject: { type: String, required: true },
    html: { type: String, required: true },
    status: { type: String, enum: ['queued', 'sending', 'sent', 'dead'], default: 'queued' },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, required: true },
    leaseUntil: Date,
    leaseToken: String,
    sentAt: Date,
    lastError: String,
}, { timestamps: true });
schema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });
export default mongoose.models.OrderEmail || mongoose.model('OrderEmail', schema);
