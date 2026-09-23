import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  assetId: { type: String, required: true, unique: true },
  ownerUserId: { type: String, required: true, index: true },
  kind: { type: String, enum: ['image', 'reference'], required: true },
  bucket: { type: String, required: true },
  key: { type: String, required: true, unique: true },
  originalName: { type: String, required: true, maxlength: 160 },
  contentType: { type: String, required: true },
  byteLength: { type: Number, required: true, min: 1, max: 6 * 1024 * 1024 },
  width: { type: Number, min: 1, max: 4096 },
  height: { type: Number, min: 1, max: 4096 },
}, { timestamps: true })
schema.index({ ownerUserId: 1, createdAt: -1 })

export default mongoose.models.FabricationAsset || mongoose.model('FabricationAsset', schema)
