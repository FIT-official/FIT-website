import mongoose from 'mongoose';
const schema = new mongoose.Schema({
    _id: String, storeId: { type: String, required: true, index: true },
    name: { type: String, required: true }, model: String, serialLast4: String, nozzleMm: Number,
    loadedMaterialSku: String, mode: { type: String, enum: ['manual', 'mock', 'prusalink', 'bambu_lan'], default: 'manual' },
    status: String, lastSeenAt: Date,
    // A future authenticated FIT Bridge receiver may persist this normalized summary.
    // No receiver, printer host, access code or LAN client exists in this scaffold.
    bridgeMessage: {
        storeId: String, printerId: String, observedAt: String, state: String,
        percent: Number, timeRemainingSec: Number, nozzleC: Number, bedC: Number,
        errorCode: String,
    },
}, { autoCreate: false, autoIndex: false });
// Existing unowned records are never inferred to belong to a creator. No seeding.
export default mongoose.models.Printer || mongoose.model('Printer', schema);
