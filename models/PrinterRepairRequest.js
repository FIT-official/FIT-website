import mongoose from 'mongoose'

const briefSchema = new mongoose.Schema({
  brand: { type: String, required: true, maxlength: 80 }, model: { type: String, required: true, maxlength: 120 },
  issue: { type: String, required: true }, details: { type: String, required: true, maxlength: 2000 },
  errorCode: { type: String, maxlength: 200 }, troubleshooting: { type: String, maxlength: 2000 },
  contactName: { type: String, required: true, maxlength: 100 }, email: { type: String, required: true, maxlength: 254 },
  phone: { type: String, maxlength: 40 }, audience: { type: String, required: true }, organisation: { type: String, maxlength: 120 },
  preferredDate: { type: String, default: '' }, handover: { type: String, enum: ['discuss_with_fit'], required: true },
}, { _id: false })
const schema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true }, customerUserId: { type: String, required: true },
  clientRequestId: { type: String, required: true }, submissionFingerprint: { type: String, required: true },
  status: { type: String, enum: ['assessment_requested', 'withdrawn'], default: 'assessment_requested' },
  brief: { type: briefSchema, required: true, immutable: true }, photoAssetIds: { type: [String], default: [] },
}, { timestamps: true })
schema.index({ customerUserId: 1, clientRequestId: 1 }, { unique: true })
schema.index({ status: 1, createdAt: -1 })
export default mongoose.models.PrinterRepairRequest || mongoose.model('PrinterRepairRequest', schema)
