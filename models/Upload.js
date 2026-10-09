import mongoose from 'mongoose';
const schema = new mongoose.Schema({
    uploadId: { type: String, required: true, unique: true }, ownerType: { type: String, enum: ['customer', 'creator'], required: true },
    ownerId: { type: String, required: true }, storeId: String, jobId: { type: String, required: true },
    filename: String, ext: String, sizeBytes: Number, contentType: String, sha256: String, bucket: String, s3Key: String,
    scanStatus: { type: String, enum: ['pending', 'clean', 'infected', 'error'], default: 'pending' },
    scanEngine: String, processing: { type: Boolean, default: false }, thumbKey: String,
    bbox: { x: Number, y: Number, z: Number }, volumeCm3: Number, estGrams: Number, estMinutes: Number,
    needsConversion: Boolean, ipConsent: { at: Date, version: String }, deleteAfter: Date,
}, { timestamps: true });
schema.index({ ownerId: 1, jobId: 1 });
schema.index({ storeId: 1, createdAt: -1 });
export default mongoose.models.Upload || mongoose.model('Upload', schema);
