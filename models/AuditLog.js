import mongoose from 'mongoose';
const schema = new mongoose.Schema({
    actorId: { type: String, required: true }, action: { type: String, required: true },
    storeId: { type: String, required: true }, at: { type: Date, default: Date.now },
}, { strict: 'throw' });
schema.index({ actorId: 1, at: -1 });
export default mongoose.models.AuditLog || mongoose.model('AuditLog', schema);
