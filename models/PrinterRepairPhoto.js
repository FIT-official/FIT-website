import mongoose from 'mongoose'

// Private, bounded image bytes use the existing database, never the public
// product bucket. No TTL: submitted customer records must not vanish silently.
const schema = new mongoose.Schema({
  assetId: { type: String, required: true, unique: true },
  ownerUserId: { type: String, required: true, index: true },
  originalName: { type: String, required: true, maxlength: 160 },
  contentType: { type: String, enum: ['image/jpeg'], required: true },
  bytes: { type: Buffer, required: true, select: false, validate: value => value.length > 0 && value.length <= 512 * 1024 },
  byteLength: { type: Number, required: true, min: 1, max: 512 * 1024 },
  width: { type: Number, required: true, min: 1, max: 2048 },
  height: { type: Number, required: true, min: 1, max: 2048 },
}, { timestamps: true })
schema.index({ ownerUserId: 1, createdAt: -1 })
export default mongoose.models.PrinterRepairPhoto || mongoose.model('PrinterRepairPhoto', schema)
