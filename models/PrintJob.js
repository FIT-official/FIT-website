import mongoose from 'mongoose';
const schema = new mongoose.Schema({
    source: { type: { type: String, enum: ['shop', 'creator', 'upload', 'repair'], required: true }, refId: { type: String, required: true } },
    storeId: { type: String, required: true }, name: { type: String, required: true }, uploadIds: [String], materialSku: String,
    qty: { type: Number, min: 1, required: true }, estMinutes: Number, estGrams: Number, actualMinutes: Number, actualGrams: Number,
    printerId: String, priority: { type: Number, default: 0 }, position: { type: Number, default: Date.now }, dueAt: Date,
    status: { type: String, enum: ['quote_due', 'queued', 'assigned', 'printing', 'qc', 'done', 'failed'], default: 'queued' },
    statusHistory: [{ status: String, at: { type: Date, default: Date.now }, by: String, note: String }],
    notes: String, reprintOf: String, attempt: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ 'source.refId': 1, attempt: 1 }, { unique: true });
schema.index({ reprintOf: 1 }, { unique: true, partialFilterExpression: { reprintOf: { $type: 'string' } } });
schema.index({ priority: -1, position: 1, createdAt: 1 });
schema.index({ storeId: 1, 'source.refId': 1 });
export default mongoose.models.PrintJob || mongoose.model('PrintJob', schema);
