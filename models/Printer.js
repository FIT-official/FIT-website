import mongoose from 'mongoose';
const schema = new mongoose.Schema({
    _id: String, name: { type: String, required: true }, model: String, serialLast4: String, nozzleMm: Number,
    loadedMaterialSku: String, mode: { type: String, enum: ['manual'], default: 'manual' }, status: String, lastSeenAt: Date,
}, { autoCreate: false, autoIndex: false });
// P0 reads the in-repo manual fixture; it does not seed or poll physical printers.
export default mongoose.models.Printer || mongoose.model('Printer', schema);
