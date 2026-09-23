import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  customerUserId: { type: String, required: true },
  creatorUserId: { type: String, required: true },
  clientRequestId: { type: String, required: true },
  submissionFingerprint: { type: String, required: true },
  status: { type: String, enum: ['submitted', 'quoted', 'in_progress', 'completed', 'cancelled'], default: 'submitted', required: true },
  // Immutable authoritative catalog/price snapshot at submission, separate from 3D quotes.
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  imageAssetId: { type: String, default: null },
  referenceAssetId: { type: String, default: null },
  customerPersonalization: { type: mongoose.Schema.Types.Mixed, default: null },
  personalization: { type: mongoose.Schema.Types.Mixed, default: null },
  providerNote: { type: String, default: '', maxlength: 2000 },
  confirmedPrice: { type: Number, min: 0, max: 100000, default: null },
  confirmedCurrency: { type: String, enum: ['sgd'], default: 'sgd' },
  revision: { type: Number, default: 0, min: 0 },
}, { timestamps: true })
schema.index({ customerUserId: 1, clientRequestId: 1 }, { unique: true })
schema.index({ creatorUserId: 1, createdAt: -1, requestId: -1 })
schema.index({ customerUserId: 1, createdAt: -1, requestId: -1 })
schema.index({ imageAssetId: 1 })
schema.index({ referenceAssetId: 1 })

export default mongoose.models.FabricationRequest || mongoose.model('FabricationRequest', schema)
